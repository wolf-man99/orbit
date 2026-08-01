-- Orbit — ledger_invariants.sql
-- Acceptance test for the guarantees in 001_immutability.sql and 002_rls.sql.
--
-- Run against a database that has the schema plus all four sql/ files applied:
--   psql -d orbit -v ON_ERROR_STOP=1 -f prisma/sql/tests/ledger_invariants.sql
--
-- Every check either prints PASS or aborts the script. A clean run ending in
-- "ALL LEDGER INVARIANTS HOLD" is the pass condition. Wrapped in a transaction
-- that rolls back, so it leaves no residue.

\set ON_ERROR_STOP on
begin;

set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_user      uuid := gen_random_uuid();
  v_other     uuid := gen_random_uuid();
  v_portfolio uuid;
  v_borrower  uuid := gen_random_uuid();
  v_loan      uuid := gen_random_uuid();
  v_period    uuid := gen_random_uuid();
begin
  v_portfolio := orbit.bootstrap_user(v_user, 'principal@example.test', 'Test Principal');
  perform orbit.bootstrap_user(v_other, 'other@example.test', 'Other Principal');

  insert into borrower (id, user_id, portfolio_id, full_name, created_at, updated_at)
  values (v_borrower, v_user, v_portfolio, 'Test Borrower', now(), now());

  insert into loan (id, user_id, portfolio_id, borrower_id, reference,
                    start_date, currency, created_at, updated_at)
  values (v_loan, v_user, v_portfolio, v_borrower, 'L-001',
          date '2026-03-15', 'INR', now(), now());

  insert into loan_terms (user_id, loan_id, version, effective_from, rate_bps,
                          rate_period, convention, day_count, grace_days,
                          anchor_day, created_at)
  values (v_user, v_loan, 1, date '2026-03-15', 200,
          'MONTHLY', 'REDUCING_SIMPLE', 'ACTUAL_365', 5, 15, now());

  -- One accrual cycle: 2% monthly on ₹5,00,000 = ₹10,000 = 1,000,000 paise.
  insert into accrual_period (id, user_id, portfolio_id, loan_id, cycle_index,
                              period_start, period_end, due_on, grace_until,
                              accrued_minor, engine_version)
  values (v_period, v_user, v_portfolio, v_loan, 1,
          date '2026-03-15', date '2026-04-14', date '2026-04-14', date '2026-04-19',
          1000000, 'test-1.0.0');

  insert into t_ids values
    ('user', v_user), ('other', v_other), ('portfolio', v_portfolio),
    ('borrower', v_borrower), ('loan', v_loan), ('period', v_period);
end
$$;

-- ---------------------------------------------------------------------------
-- Helper: assert that a statement fails with an expected SQLSTATE
-- ---------------------------------------------------------------------------
create or replace function pg_temp.expect_failure(p_label text, p_sql text, p_sqlstate text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_sqlstate then
      raise notice 'PASS  %', p_label;
      return;
    end if;
    raise exception 'FAIL  % — expected SQLSTATE %, got % (%)',
      p_label, p_sqlstate, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL  % — statement unexpectedly succeeded', p_label;
end;
$$;

create or replace function pg_temp.expect_success(p_label text, p_sql text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise notice 'PASS  %', p_label;
exception when others then
  raise exception 'FAIL  % — %', p_label, sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Posting shape                                    (001 §2)
-- ---------------------------------------------------------------------------
do $$
declare
  u uuid := (select v from t_ids where k = 'user');
  p uuid := (select v from t_ids where k = 'portfolio');
  b uuid := (select v from t_ids where k = 'borrower');
  l uuid := (select v from t_ids where k = 'loan');
begin
  perform pg_temp.expect_success(
    'disbursement with correct postings is accepted',
    format($q$
      insert into ledger_event (id, user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, principal_delta_minor, cash_delta_minor,
        idempotency_key, created_by, tax_category)
      values ('%s', '%s', '%s', '%s', '%s', 'LOAN_DISBURSED',
        timestamptz '2026-03-15 10:00+05:30', 50000000, 50000000, -50000000,
        'disb-1', '%s', 'PRINCIPAL_MOVEMENT')
    $q$, '11111111-1111-1111-1111-111111111111', u, p, b, l, u));

  perform pg_temp.expect_failure(
    'disbursement with mismatched cash delta is rejected',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, principal_delta_minor, cash_delta_minor,
        idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'LOAN_DISBURSED',
        now(), 50000000, 50000000, 0, 'disb-bad', '%s')
    $q$, u, p, b, l, u), '23514');

  perform pg_temp.expect_failure(
    'interest receipt posting to principal is rejected',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, principal_delta_minor, cash_delta_minor,
        idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'INTEREST_RECEIVED',
        now(), 1000000, -1000000, 1000000, 'int-bad', '%s')
    $q$, u, p, b, l, u), '23514');

  perform pg_temp.expect_failure(
    'negative amount is rejected',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, interest_delta_minor, cash_delta_minor,
        idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'INTEREST_RECEIVED',
        now(), -1000, 1000, -1000, 'neg', '%s')
    $q$, u, p, b, l, u), '23514');

  perform pg_temp.expect_failure(
    'adjustment without a reason is rejected',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, interest_delta_minor, idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'ADJUSTMENT', now(), 500, 500, 'adj-noreason', '%s')
    $q$, u, p, b, l, u), '23514');

  perform pg_temp.expect_failure(
    'note carrying a balance movement is rejected',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, interest_delta_minor, idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'NOTE_ADDED', now(), 100, 100, 'note-bad', '%s')
    $q$, u, p, b, l, u), '23514');
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Append-only                                      (001 §1)
-- ---------------------------------------------------------------------------
do $$
begin
  perform pg_temp.expect_failure(
    'UPDATE on ledger_event is rejected',
    $q$ update ledger_event set amount_minor = 1 where idempotency_key = 'disb-1' $q$,
    '23001');

  perform pg_temp.expect_failure(
    'DELETE on ledger_event is rejected',
    $q$ delete from ledger_event where idempotency_key = 'disb-1' $q$,
    '23001');

  perform pg_temp.expect_failure(
    'note text cannot be edited after the fact',
    $q$ update ledger_event set note = 'rewritten' where idempotency_key = 'disb-1' $q$,
    '23001');
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Idempotency                                      (PRD REL-02)
-- ---------------------------------------------------------------------------
do $$
declare
  u uuid := (select v from t_ids where k = 'user');
  p uuid := (select v from t_ids where k = 'portfolio');
  b uuid := (select v from t_ids where k = 'borrower');
  l uuid := (select v from t_ids where k = 'loan');
begin
  perform pg_temp.expect_failure(
    'replaying an idempotency key does not double-post',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, principal_delta_minor, cash_delta_minor,
        idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'LOAN_DISBURSED',
        now(), 50000000, 50000000, -50000000, 'disb-1', '%s')
    $q$, u, p, b, l, u), '23505');
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Reversal symmetry                                (001 §3)
-- ---------------------------------------------------------------------------
do $$
declare
  u uuid := (select v from t_ids where k = 'user');
  p uuid := (select v from t_ids where k = 'portfolio');
  b uuid := (select v from t_ids where k = 'borrower');
  l uuid := (select v from t_ids where k = 'loan');
  target uuid := '11111111-1111-1111-1111-111111111111';
begin
  perform pg_temp.expect_failure(
    'reversal that does not negate exactly is rejected',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, principal_delta_minor, cash_delta_minor,
        reverses_event_id, reason, idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'REVERSAL',
        now(), 50000000, -40000000, 50000000, '%s', 'wrong amount', 'rev-bad', '%s')
    $q$, u, p, b, l, target, u), '23001');

  perform pg_temp.expect_failure(
    'reversal without a reason is rejected',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, principal_delta_minor, cash_delta_minor,
        reverses_event_id, idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'REVERSAL',
        now(), 50000000, -50000000, 50000000, '%s', 'rev-noreason', '%s')
    $q$, u, p, b, l, target, u), '23514');

  perform pg_temp.expect_failure(
    'a non-reversal event may not reference a reversal target',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, interest_delta_minor, cash_delta_minor,
        reverses_event_id, idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'INTEREST_RECEIVED',
        now(), 1000, -1000, 1000, '%s', 'bad-ref', '%s')
    $q$, u, p, b, l, target, u), '23514');

  perform pg_temp.expect_success(
    'exact reversal is accepted',
    format($q$
      insert into ledger_event (id, user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, principal_delta_minor, cash_delta_minor,
        reverses_event_id, reason, idempotency_key, created_by)
      values ('22222222-2222-2222-2222-222222222222', '%s', '%s', '%s', '%s', 'REVERSAL',
        now(), 50000000, -50000000, 50000000, '%s', 'recorded against wrong loan', 'rev-1', '%s')
    $q$, u, p, b, l, target, u));

  perform pg_temp.expect_failure(
    'an event cannot be reversed twice',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, principal_delta_minor, cash_delta_minor,
        reverses_event_id, reason, idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'REVERSAL',
        now(), 50000000, -50000000, 50000000, '%s', 'again', 'rev-2', '%s')
    $q$, u, p, b, l, target, u), '23505');

  perform pg_temp.expect_failure(
    'a reversal cannot itself be reversed',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, principal_delta_minor, cash_delta_minor,
        reverses_event_id, reason, idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'REVERSAL',
        now(), 50000000, 50000000, -50000000,
        '22222222-2222-2222-2222-222222222222', 'undo the undo', 'rev-3', '%s')
    $q$, u, p, b, l, u), '23001');
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Settlement synchronisation                       (001 §5)
-- ---------------------------------------------------------------------------
do $$
declare
  u   uuid := (select v from t_ids where k = 'user');
  p   uuid := (select v from t_ids where k = 'portfolio');
  b   uuid := (select v from t_ids where k = 'borrower');
  l   uuid := (select v from t_ids where k = 'loan');
  per uuid := (select v from t_ids where k = 'period');
  ev1 uuid := gen_random_uuid();
  ev2 uuid := gen_random_uuid();
  rev uuid := gen_random_uuid();
  s   bigint;
  st  accrual_period_status;
begin
  -- Partial receipt: ₹4,000 against ₹10,000 accrued.
  insert into ledger_event (id, user_id, portfolio_id, borrower_id, loan_id, type,
    occurred_at, amount_minor, interest_delta_minor, cash_delta_minor,
    idempotency_key, created_by, tax_category)
  values (ev1, u, p, b, l, 'INTEREST_RECEIVED', now(), 400000, -400000, 400000,
          'int-partial', u, 'INTEREST_INCOME');

  insert into payment_allocation (user_id, event_id, period_id, amount_minor)
  values (u, ev1, per, 400000);

  select settled_minor, status into s, st from accrual_period where id = per;
  if s <> 400000 or st <> 'PARTIAL' then
    raise exception 'FAIL  partial allocation — settled=% status=%', s, st;
  end if;
  raise notice 'PASS  partial allocation marks the cycle PARTIAL';

  -- Balance of the cycle.
  insert into ledger_event (id, user_id, portfolio_id, borrower_id, loan_id, type,
    occurred_at, amount_minor, interest_delta_minor, cash_delta_minor,
    idempotency_key, created_by, tax_category)
  values (ev2, u, p, b, l, 'INTEREST_RECEIVED', now(), 600000, -600000, 600000,
          'int-balance', u, 'INTEREST_INCOME');

  insert into payment_allocation (user_id, event_id, period_id, amount_minor)
  values (u, ev2, per, 600000);

  select settled_minor, status into s, st from accrual_period where id = per;
  if s <> 1000000 or st <> 'SETTLED' then
    raise exception 'FAIL  full allocation — settled=% status=%', s, st;
  end if;
  raise notice 'PASS  completing allocation marks the cycle SETTLED';

  -- Reversing the second receipt unwinds settlement via a negative allocation,
  -- with no row ever mutated.
  insert into ledger_event (id, user_id, portfolio_id, borrower_id, loan_id, type,
    occurred_at, amount_minor, interest_delta_minor, cash_delta_minor,
    reverses_event_id, reason, idempotency_key, created_by)
  values (rev, u, p, b, l, 'REVERSAL', now(), 600000, 600000, -600000,
          ev2, 'payment bounced', 'rev-int', u);

  insert into payment_allocation (user_id, event_id, period_id, amount_minor)
  values (u, rev, per, -600000);

  select settled_minor, status into s, st from accrual_period where id = per;
  if s <> 400000 or st <> 'PARTIAL' then
    raise exception 'FAIL  reversal unwind — settled=% status=%', s, st;
  end if;
  raise notice 'PASS  reversal unwinds settlement without mutating any row';

  perform pg_temp.expect_failure(
    'over-settling a cycle is rejected',
    format($q$
      insert into payment_allocation (user_id, event_id, period_id, amount_minor)
      values ('%s', '%s', '%s', 9999999)
    $q$, u, ev1, per), '23514');
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Balance recomputation is a pure sum               (PRD REL-05)
-- ---------------------------------------------------------------------------
do $$
declare
  l uuid := (select v from t_ids where k = 'loan');
  principal bigint;
  interest  bigint;
  cash      bigint;
begin
  select coalesce(sum(principal_delta_minor), 0),
         coalesce(sum(interest_delta_minor), 0),
         coalesce(sum(cash_delta_minor), 0)
    into principal, interest, cash
  from ledger_event where loan_id = l;

  -- Disbursement was reversed, so principal nets to zero.
  -- Interest: −400000 −600000 +600000 = −600000 owed, i.e. ₹4,000 received.
  if principal <> 0 then
    raise exception 'FAIL  principal should net to 0 after reversal, got %', principal;
  end if;
  if interest <> -400000 then
    raise exception 'FAIL  interest should net to -400000, got %', interest;
  end if;
  if cash <> 400000 then
    raise exception 'FAIL  cash should net to 400000, got %', cash;
  end if;
  raise notice 'PASS  balances recompute from the event log by summation alone';
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Borrowers with history are archived, not deleted   (PRD B-10)
-- ---------------------------------------------------------------------------
do $$
declare
  b uuid := (select v from t_ids where k = 'borrower');
begin
  perform pg_temp.expect_failure(
    'deleting a borrower carrying ledger history is rejected',
    format($q$ delete from borrower where id = '%s' $q$, b), '23001');
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Tenant isolation                                  (002 §3, PRD SEC-01)
-- ---------------------------------------------------------------------------
do $$
declare
  u     uuid := (select v from t_ids where k = 'user');
  other uuid := (select v from t_ids where k = 'other');
  p     uuid := (select v from t_ids where k = 'portfolio');
  visible int;
begin
  -- Act as the application role, identified as the owning user.
  set local role orbit_app;
  perform set_config('app.user_id', u::text, true);

  select count(*) into visible from borrower;
  if visible <> 1 then
    raise exception 'FAIL  owner should see 1 borrower, saw %', visible;
  end if;
  raise notice 'PASS  owner sees their own rows through RLS';

  -- Same connection, different identity.
  perform set_config('app.user_id', other::text, true);

  select count(*) into visible from borrower;
  if visible <> 0 then
    raise exception 'FAIL  other tenant should see 0 borrowers, saw %', visible;
  end if;

  select count(*) into visible from ledger_event;
  if visible <> 0 then
    raise exception 'FAIL  other tenant should see 0 ledger events, saw %', visible;
  end if;
  raise notice 'PASS  a different tenant sees nothing';

  reset role;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. The append-only tables are not merely trigger-protected
-- ---------------------------------------------------------------------------
do $$
declare
  -- Read the fixture before switching role: t_ids is a temp table owned by the
  -- test session, and orbit_app has no privilege on it.
  u text := (select v::text from t_ids where k = 'user');
begin
  set local role orbit_app;
  perform set_config('app.user_id', u, true);

  perform pg_temp.expect_failure(
    'orbit_app holds no UPDATE privilege on ledger_event at all',
    $q$ update ledger_event set note = 'x' where true $q$, '42501');

  perform pg_temp.expect_failure(
    'orbit_app holds no DELETE privilege on ledger_event at all',
    $q$ delete from ledger_event where true $q$, '42501');

  reset role;
end
$$;

-- ---------------------------------------------------------------------------
-- 10. Cross-tenant writes are unrepresentable           (002 §4)
-- ---------------------------------------------------------------------------
do $$
declare
  other uuid := (select v from t_ids where k = 'other');
  p     uuid := (select v from t_ids where k = 'portfolio');
  b     uuid := (select v from t_ids where k = 'borrower');
  l     uuid := (select v from t_ids where k = 'loan');
begin
  perform pg_temp.expect_failure(
    'an event cannot claim one tenant while pointing at another tenant''s loan',
    format($q$
      insert into ledger_event (user_id, portfolio_id, borrower_id, loan_id, type,
        occurred_at, amount_minor, interest_delta_minor, cash_delta_minor,
        idempotency_key, created_by)
      values ('%s', '%s', '%s', '%s', 'INTEREST_RECEIVED',
        now(), 1000, -1000, 1000, 'cross-tenant', '%s')
    $q$, other, p, b, l, other), '23503');
end
$$;

do $$ begin raise notice '';
             raise notice 'ALL LEDGER INVARIANTS HOLD';
end $$;

rollback;
