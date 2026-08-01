-- Orbit — 001_immutability.sql
-- Ledger integrity: append-only enforcement, posting rules, settlement sync.
--
-- These guarantees live in the database, not the application. Application code
-- can be wrong; a trigger cannot be bypassed by a bad migration, a console
-- session, or a future contributor who has not read the PRD.
--
-- Apply after every `prisma migrate deploy`. Idempotent.

create schema if not exists orbit;

-- ===========================================================================
-- 1. Append-only enforcement                                    (PRD §6.4)
-- ===========================================================================

create or replace function orbit.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'orbit: % is append-only. % is not permitted. Append a REVERSAL or ADJUSTMENT instead.',
    tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create or replace function orbit.reject_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'orbit: % is append-only. TRUNCATE is not permitted.', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists ledger_event_no_update on ledger_event;
create trigger ledger_event_no_update
  before update on ledger_event
  for each row execute function orbit.reject_mutation();

drop trigger if exists ledger_event_no_delete on ledger_event;
create trigger ledger_event_no_delete
  before delete on ledger_event
  for each row execute function orbit.reject_mutation();

drop trigger if exists ledger_event_no_truncate on ledger_event;
create trigger ledger_event_no_truncate
  before truncate on ledger_event
  for each statement execute function orbit.reject_truncate();

-- Allocations are append-only for the same reason: unwinding a receipt appends
-- a negative allocation rather than deleting the original.        (PRD E-11)
drop trigger if exists payment_allocation_no_update on payment_allocation;
create trigger payment_allocation_no_update
  before update on payment_allocation
  for each row execute function orbit.reject_mutation();

drop trigger if exists payment_allocation_no_delete on payment_allocation;
create trigger payment_allocation_no_delete
  before delete on payment_allocation
  for each row execute function orbit.reject_mutation();

drop trigger if exists payment_allocation_no_truncate on payment_allocation;
create trigger payment_allocation_no_truncate
  before truncate on payment_allocation
  for each statement execute function orbit.reject_truncate();

-- Notes are append-only: a new note supersedes, both remain.       (PRD BP-06)
drop trigger if exists borrower_note_no_update on borrower_note;
create trigger borrower_note_no_update
  before update on borrower_note
  for each row execute function orbit.reject_mutation();

-- ===========================================================================
-- 2. Posting rules                                              (PRD §6.5)
-- ===========================================================================
-- Sign convention: deltas describe the effect on balances owed TO the lender.
--   principal/interest/penalty delta  > 0 increases what is owed
--   cash delta                        > 0 means money into the lender's hands
--
--   LOAN_DISBURSED      principal +P, cash −P
--   INTEREST_RECEIVED   interest  −A, cash +A
--   PRINCIPAL_RECEIVED  principal −A, cash +A
--   PENALTY_CHARGED     penalty   +A, cash  0
--   PENALTY_WAIVED      penalty   −A, cash  0
--   LOAN_WRITTEN_OFF    principal/interest reduced, cash 0
--   ADJUSTMENT          any sign, reason required
--   REVERSAL            exact negation of the referenced event
--   non-financial       all deltas 0

alter table ledger_event drop constraint if exists ledger_event_amount_non_negative;
alter table ledger_event add constraint ledger_event_amount_non_negative
  check (amount_minor >= 0);

alter table ledger_event drop constraint if exists ledger_event_occurred_not_future;
alter table ledger_event add constraint ledger_event_occurred_not_future
  check (occurred_at <= recorded_at + interval '1 day');

-- Reversals reference exactly one event; nothing else may.
alter table ledger_event drop constraint if exists ledger_event_reversal_shape;
alter table ledger_event add constraint ledger_event_reversal_shape
  check (
    (type = 'REVERSAL' and reverses_event_id is not null)
    or
    (type <> 'REVERSAL' and reverses_event_id is null)
  );

-- Destructive or discretionary events must say why.               (PRD T-08)
alter table ledger_event drop constraint if exists ledger_event_reason_required;
alter table ledger_event add constraint ledger_event_reason_required
  check (
    type not in ('ADJUSTMENT', 'REVERSAL', 'PENALTY_WAIVED', 'LOAN_WRITTEN_OFF')
    or (reason is not null and length(btrim(reason)) > 0)
  );

-- Every financial event belongs to a loan.
alter table ledger_event drop constraint if exists ledger_event_financial_needs_loan;
alter table ledger_event add constraint ledger_event_financial_needs_loan
  check (
    type in ('NOTE_ADDED', 'DOCUMENT_UPLOADED', 'REMINDER_SENT')
    or loan_id is not null
  );

-- Non-financial events never move a balance.
alter table ledger_event drop constraint if exists ledger_event_nonfinancial_zero;
alter table ledger_event add constraint ledger_event_nonfinancial_zero
  check (
    type not in ('NOTE_ADDED', 'DOCUMENT_UPLOADED', 'REMINDER_SENT',
                 'LOAN_EXTENDED', 'LOAN_TERMS_AMENDED', 'LOAN_CLOSED')
    or (principal_delta_minor = 0 and interest_delta_minor = 0
        and penalty_delta_minor = 0 and cash_delta_minor = 0 and amount_minor = 0)
  );

-- Per-type posting shape.
alter table ledger_event drop constraint if exists ledger_event_posting_shape;
alter table ledger_event add constraint ledger_event_posting_shape
  check (
    case type
      when 'LOAN_DISBURSED' then
        principal_delta_minor = amount_minor
        and cash_delta_minor = -amount_minor
        and interest_delta_minor = 0 and penalty_delta_minor = 0
        and amount_minor > 0
      when 'INTEREST_RECEIVED' then
        interest_delta_minor = -amount_minor
        and cash_delta_minor = amount_minor
        and principal_delta_minor = 0 and penalty_delta_minor = 0
        and amount_minor > 0
      when 'PRINCIPAL_RECEIVED' then
        principal_delta_minor = -amount_minor
        and cash_delta_minor = amount_minor
        and interest_delta_minor = 0 and penalty_delta_minor = 0
        and amount_minor > 0
      when 'PENALTY_CHARGED' then
        penalty_delta_minor = amount_minor
        and cash_delta_minor = 0
        and principal_delta_minor = 0 and interest_delta_minor = 0
        and amount_minor > 0
      when 'PENALTY_WAIVED' then
        penalty_delta_minor = -amount_minor
        and cash_delta_minor = 0
        and principal_delta_minor = 0 and interest_delta_minor = 0
        and amount_minor > 0
      when 'LOAN_WRITTEN_OFF' then
        principal_delta_minor <= 0 and interest_delta_minor <= 0
        and cash_delta_minor = 0
        and amount_minor > 0
      else true
    end
  );

-- An adjustment that adjusts nothing is a mistake.
alter table ledger_event drop constraint if exists ledger_event_adjustment_non_zero;
alter table ledger_event add constraint ledger_event_adjustment_non_zero
  check (
    type <> 'ADJUSTMENT'
    or principal_delta_minor <> 0 or interest_delta_minor <> 0
    or penalty_delta_minor <> 0 or cash_delta_minor <> 0
  );

-- ===========================================================================
-- 3. Reversal symmetry
-- ===========================================================================
-- A REVERSAL must negate its target exactly, must not target another reversal,
-- and must belong to the same loan. Cross-row invariants need a trigger; a
-- CHECK constraint cannot see the referenced row.

create or replace function orbit.enforce_reversal_symmetry()
returns trigger
language plpgsql
as $$
declare
  target ledger_event%rowtype;
begin
  if new.type <> 'REVERSAL' then
    return new;
  end if;

  select * into target from ledger_event where id = new.reverses_event_id for update;

  if not found then
    raise exception 'orbit: REVERSAL references a non-existent event %', new.reverses_event_id
      using errcode = 'foreign_key_violation';
  end if;

  if target.type = 'REVERSAL' then
    raise exception 'orbit: a REVERSAL cannot be reversed (event %). Append a new corrected event instead.', target.id
      using errcode = 'restrict_violation';
  end if;

  if target.user_id <> new.user_id then
    raise exception 'orbit: cross-tenant reversal is not permitted'
      using errcode = 'insufficient_privilege';
  end if;

  if target.loan_id is distinct from new.loan_id then
    raise exception 'orbit: REVERSAL must belong to the same loan as event %', target.id
      using errcode = 'restrict_violation';
  end if;

  if new.principal_delta_minor <> -target.principal_delta_minor
     or new.interest_delta_minor <> -target.interest_delta_minor
     or new.penalty_delta_minor  <> -target.penalty_delta_minor
     or new.cash_delta_minor     <> -target.cash_delta_minor
     or new.amount_minor         <>  target.amount_minor then
    raise exception 'orbit: REVERSAL of event % must negate its postings exactly', target.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists ledger_event_reversal_symmetry on ledger_event;
create trigger ledger_event_reversal_symmetry
  before insert on ledger_event
  for each row execute function orbit.enforce_reversal_symmetry();

-- ===========================================================================
-- 4. Closed loans stop accepting movement
-- ===========================================================================
-- Recovery against a written-off loan is recorded but never reopens it.
-- (Phase 1 Q4 → default)

create or replace function orbit.enforce_loan_open_for_posting()
returns trigger
language plpgsql
as $$
declare
  loan_status_value loan_status;
begin
  if new.loan_id is null
     or new.type in ('NOTE_ADDED', 'DOCUMENT_UPLOADED', 'REMINDER_SENT',
                     'ADJUSTMENT', 'REVERSAL', 'INTEREST_RECEIVED',
                     'PRINCIPAL_RECEIVED') then
    return new;
  end if;

  select status into loan_status_value from loan where id = new.loan_id;

  if loan_status_value in ('CLOSED', 'WRITTEN_OFF')
     and new.type in ('LOAN_DISBURSED', 'PENALTY_CHARGED', 'LOAN_EXTENDED') then
    raise exception 'orbit: loan % is %; % is not permitted', new.loan_id, loan_status_value, new.type
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists ledger_event_loan_open on ledger_event;
create trigger ledger_event_loan_open
  before insert on ledger_event
  for each row execute function orbit.enforce_loan_open_for_posting();

-- ===========================================================================
-- 5. Settlement synchronisation
-- ===========================================================================
-- accrual_period.settled_minor is a cache of sum(payment_allocation.amount_minor).
-- Maintaining it in a trigger means it cannot drift, whatever the caller does.

alter table payment_allocation drop constraint if exists payment_allocation_non_zero;
alter table payment_allocation add constraint payment_allocation_non_zero
  check (amount_minor <> 0);

create or replace function orbit.sync_period_settlement()
returns trigger
language plpgsql
as $$
declare
  total   bigint;
  accrued bigint;
  waived  bigint;
  current_status accrual_period_status;
begin
  select coalesce(sum(amount_minor), 0) into total
  from payment_allocation where period_id = new.period_id;

  select accrued_minor, waived_minor, status
    into accrued, waived, current_status
  from accrual_period where id = new.period_id for update;

  update accrual_period
     set settled_minor = total,
         status = case
           when current_status in ('CANCELLED', 'WAIVED') then current_status
           when total + waived >= accrued then 'SETTLED'::accrual_period_status
           when total > 0 then 'PARTIAL'::accrual_period_status
           when grace_until < current_date then 'OVERDUE'::accrual_period_status
           when due_on <= current_date then 'DUE'::accrual_period_status
           else 'UPCOMING'::accrual_period_status
         end
   where id = new.period_id;

  return null;
end;
$$;

drop trigger if exists payment_allocation_sync_settlement on payment_allocation;
create trigger payment_allocation_sync_settlement
  after insert on payment_allocation
  for each row execute function orbit.sync_period_settlement();

-- An accrual period is never over-settled beyond a rounding unit.
alter table accrual_period drop constraint if exists accrual_period_settlement_bounds;
alter table accrual_period add constraint accrual_period_settlement_bounds
  check (settled_minor >= 0 and settled_minor <= accrued_minor + waived_minor + 1);

alter table accrual_period drop constraint if exists accrual_period_date_order;
alter table accrual_period add constraint accrual_period_date_order
  check (period_start <= period_end and due_on <= grace_until);

alter table accrual_segment drop constraint if exists accrual_segment_date_order;
alter table accrual_segment add constraint accrual_segment_date_order
  check (segment_start <= segment_end and days >= 0 and days_in_year > 0);

-- ===========================================================================
-- 6. Structural guards elsewhere
-- ===========================================================================

alter table loan drop constraint if exists loan_date_order;
alter table loan add constraint loan_date_order
  check (expected_end_date is null or expected_end_date >= start_date);

alter table loan drop constraint if exists loan_principal_non_negative;
alter table loan add constraint loan_principal_non_negative
  check (original_principal_minor >= 0);

alter table loan_terms drop constraint if exists loan_terms_sane;
alter table loan_terms add constraint loan_terms_sane
  check (
    rate_bps >= 0 and rate_bps <= 100000       -- 0% to 1000% per period
    and grace_days >= 0 and grace_days <= 180
    and anchor_day between 1 and 31
    and version >= 1
  );

alter table portfolio drop constraint if exists portfolio_defaults_sane;
alter table portfolio add constraint portfolio_defaults_sane
  check (default_grace_days between 0 and 180
         and concentration_warn_bps between 0 and 10000);

-- A borrower carrying ledger history is archived, never deleted. (PRD B-10)
create or replace function orbit.enforce_borrower_archive_only()
returns trigger
language plpgsql
as $$
declare
  event_count bigint;
begin
  select count(*) into event_count from ledger_event where borrower_id = old.id;
  if event_count > 0 then
    raise exception
      'orbit: borrower % has % ledger events and cannot be deleted. Archive instead.',
      old.id, event_count
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists borrower_archive_only on borrower;
create trigger borrower_archive_only
  before delete on borrower
  for each row execute function orbit.enforce_borrower_archive_only();
