-- Orbit — 002_rls.sql
-- Row-level security. Every row is scoped to its owner at the database. (PRD SEC-01)
--
-- ---------------------------------------------------------------------------
-- IMPORTANT — why an application role exists
-- ---------------------------------------------------------------------------
-- RLS does not apply to a table's OWNER unless FORCE ROW LEVEL SECURITY is set,
-- and it never applies to roles holding BYPASSRLS. If the application connects
-- as `postgres` (the migration/owner role, as a default Supabase connection
-- string does), every policy below is silently inert.
--
-- So: migrations run as the owner, and the application connects as `orbit_app`,
-- which owns nothing and holds no BYPASSRLS. Tenancy is then enforced twice —
-- once by the repository layer, once by the database — and neither is trusted
-- to be the only line of defence.
--
-- Apply after every `prisma migrate deploy`. Idempotent.

-- ===========================================================================
-- 1. Tenant resolution
-- ===========================================================================
-- Two callers must both work:
--   • Supabase client / PostgREST  → identity comes from auth.uid()
--   • Prisma over a pooled pgBouncer connection → identity is set per
--     transaction with `SET LOCAL app.user_id = '<uuid>'`
--
-- The Prisma path MUST use SET LOCAL inside the same transaction as the query.
-- A session-level SET would leak identity across pooled connections.

create or replace function orbit.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = orbit, public, pg_catalog
as $$
declare
  claim text;
begin
  claim := current_setting('app.user_id', true);
  if claim is not null and claim <> '' then
    return claim::uuid;
  end if;

  -- auth.uid() is absent outside Supabase (e.g. a local test database).
  begin
    return auth.uid();
  exception
    when undefined_function or undefined_table or invalid_schema_name then
      return null;
  end;
end;
$$;

comment on function orbit.current_user_id() is
  'Resolves the acting user from app.user_id (Prisma, per-transaction) or auth.uid() (Supabase).';

-- ===========================================================================
-- 2. Application role
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'orbit_app') then
    create role orbit_app nologin;
  end if;

  -- Supabase provisions `authenticated` for us. A plain Postgres instance
  -- (local development, CI, the test harness) does not, and every policy below
  -- names it, so create it when it is missing.
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant usage on schema public, orbit to orbit_app;
grant execute on function orbit.current_user_id() to orbit_app;

-- ===========================================================================
-- 3. Policies
-- ===========================================================================
-- Every tenant-scoped table carries user_id precisely so each policy is a
-- single indexed predicate with no join. (Schema §Design notes)
--
-- `(select orbit.current_user_id())` is wrapped in a subselect so the planner
-- evaluates it once per statement as an InitPlan rather than once per row.

do $$
declare
  -- Tables where the owner may read and write freely.
  mutable_tables text[] := array[
    'portfolio', 'borrower', 'loan', 'loan_terms', 'loan_balance',
    'accrual_period', 'accrual_segment', 'reminder', 'notification',
    'document', 'portfolio_snapshot', 'push_subscription', 'engine_run'
  ];
  -- Append-only tables: select and insert only, never update or delete.
  append_only_tables text[] := array[
    'ledger_event', 'payment_allocation', 'borrower_note'
  ];
  t text;
begin
  foreach t in array mutable_tables || append_only_tables loop
    -- ENABLE, never FORCE. FORCE would subject the table owner to these
    -- policies too, and since every policy is scoped TO orbit_app/authenticated,
    -- the owner would match none of them and be denied outright — breaking
    -- migrations, the engine jobs, and the SECURITY DEFINER functions in 004.
    -- Owner bypass is intentional; the application never connects as the owner.
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from orbit_app', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_isolation', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_select', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_insert', t);
  end loop;

  foreach t in array mutable_tables loop
    execute format('grant select, insert, update, delete on table %I to orbit_app', t);
    execute format($f$
      create policy %I on %I
        for all
        to orbit_app, authenticated
        using (user_id = (select orbit.current_user_id()))
        with check (user_id = (select orbit.current_user_id()))
    $f$, t || '_tenant_isolation', t);
  end loop;

  foreach t in array append_only_tables loop
    -- No UPDATE or DELETE grant at all. The triggers in 001 are the second lock.
    execute format('grant select, insert on table %I to orbit_app', t);
    execute format($f$
      create policy %I on %I
        for select
        to orbit_app, authenticated
        using (user_id = (select orbit.current_user_id()))
    $f$, t || '_tenant_select', t);
    execute format($f$
      create policy %I on %I
        for insert
        to orbit_app, authenticated
        with check (user_id = (select orbit.current_user_id()))
    $f$, t || '_tenant_insert', t);
  end loop;
end
$$;

-- The user row itself.
alter table "user" enable row level security;
grant select, update on table "user" to orbit_app;
drop policy if exists user_self_access on "user";
create policy user_self_access on "user"
  for all
  to orbit_app, authenticated
  using (id = (select orbit.current_user_id()))
  with check (id = (select orbit.current_user_id()));

alter table user_settings enable row level security;
grant select, insert, update on table user_settings to orbit_app;
drop policy if exists user_settings_self_access on user_settings;
create policy user_settings_self_access on user_settings
  for all
  to orbit_app, authenticated
  using (user_id = (select orbit.current_user_id()))
  with check (user_id = (select orbit.current_user_id()));

-- Sequences backing BIGSERIAL columns (ledger_event.seq).
grant usage, select on all sequences in schema public to orbit_app;
alter default privileges in schema public grant usage, select on sequences to orbit_app;

-- ===========================================================================
-- 4. Cross-tenant integrity
-- ===========================================================================
-- RLS stops a user reading another tenant's rows. It does not stop a bug from
-- writing a row whose loan_id belongs to a different tenant than its user_id.
-- These composite foreign keys make that unrepresentable.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'loan_user_portfolio_unique'
  ) then
    alter table loan add constraint loan_user_portfolio_unique
      unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'borrower_user_unique'
  ) then
    alter table borrower add constraint borrower_user_unique
      unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'accrual_period_user_unique'
  ) then
    alter table accrual_period add constraint accrual_period_user_unique
      unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ledger_event_user_unique'
  ) then
    alter table ledger_event add constraint ledger_event_user_unique
      unique (id, user_id);
  end if;
end
$$;

alter table ledger_event drop constraint if exists ledger_event_loan_same_tenant;
alter table ledger_event add constraint ledger_event_loan_same_tenant
  foreign key (loan_id, user_id) references loan (id, user_id) on delete restrict;

alter table ledger_event drop constraint if exists ledger_event_borrower_same_tenant;
alter table ledger_event add constraint ledger_event_borrower_same_tenant
  foreign key (borrower_id, user_id) references borrower (id, user_id) on delete restrict;

alter table payment_allocation drop constraint if exists payment_allocation_event_same_tenant;
alter table payment_allocation add constraint payment_allocation_event_same_tenant
  foreign key (event_id, user_id) references ledger_event (id, user_id) on delete restrict;

alter table payment_allocation drop constraint if exists payment_allocation_period_same_tenant;
alter table payment_allocation add constraint payment_allocation_period_same_tenant
  foreign key (period_id, user_id) references accrual_period (id, user_id) on delete restrict;

alter table accrual_period drop constraint if exists accrual_period_loan_same_tenant;
alter table accrual_period add constraint accrual_period_loan_same_tenant
  foreign key (loan_id, user_id) references loan (id, user_id) on delete cascade;

alter table loan drop constraint if exists loan_borrower_same_tenant;
alter table loan add constraint loan_borrower_same_tenant
  foreign key (borrower_id, user_id) references borrower (id, user_id) on delete restrict;
