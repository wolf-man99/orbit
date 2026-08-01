-- Orbit — 004_auth_bridge.sql
-- Bridges Supabase Auth to Orbit's own tables and bootstraps a new account.
--
-- A user who has just verified their email must land on a working dashboard,
-- not an error. That means the user row, their settings, and their default
-- portfolio all exist before the first query runs — created atomically, in the
-- same transaction as the auth record.
--
-- Skip this file when running against a plain Postgres instance with no
-- `auth` schema; §2 provides the equivalent entry point for tests and seeds.
--
-- Apply after every `prisma migrate deploy`. Idempotent.

-- ===========================================================================
-- 1. Bootstrap
-- ===========================================================================

create or replace function orbit.bootstrap_user(
  p_user_id   uuid,
  p_email     text,
  p_full_name text default null,
  p_locale    text default 'en-IN',
  p_time_zone text default 'Asia/Kolkata'
)
returns uuid
language plpgsql
security definer
set search_path = orbit, public, pg_catalog
as $$
declare
  v_portfolio_id uuid;
begin
  insert into "user" (id, email, full_name, locale, time_zone, created_at, updated_at)
  values (p_user_id, p_email, p_full_name, p_locale, p_time_zone, now(), now())
  on conflict (id) do nothing;

  insert into user_settings (user_id, created_at, updated_at)
  values (p_user_id, now(), now())
  on conflict (user_id) do nothing;

  select id into v_portfolio_id
  from portfolio
  where user_id = p_user_id and is_default and archived_at is null;

  if v_portfolio_id is null then
    insert into portfolio (user_id, name, currency, is_default, created_at, updated_at)
    values (p_user_id, 'My Portfolio', 'INR', true, now(), now())
    returning id into v_portfolio_id;
  end if;

  return v_portfolio_id;
end;
$$;

comment on function orbit.bootstrap_user is
  'Idempotently creates the user row, settings, and default portfolio. Safe to call on every sign-in.';

-- ===========================================================================
-- 2. Supabase Auth trigger
-- ===========================================================================

do $$
begin
  if to_regclass('auth.users') is null then
    raise notice 'orbit: auth.users not found — skipping the Supabase trigger. Call orbit.bootstrap_user() directly.';
    return;
  end if;

  execute $fn$
    create or replace function orbit.handle_new_auth_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = orbit, public, pg_catalog
    as $body$
    begin
      perform orbit.bootstrap_user(
        new.id,
        new.email,
        coalesce(
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'name'
        )
      );
      return new;
    end;
    $body$;
  $fn$;

  execute 'drop trigger if exists on_auth_user_created on auth.users';
  execute $tg$
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function orbit.handle_new_auth_user();
  $tg$;
end
$$;

-- ===========================================================================
-- 3. Account deletion                                          (PRD SEC-09, S-10)
-- ===========================================================================
-- The append-only triggers block DELETE on ledger_event, which would otherwise
-- make a user's right to erasure impossible to honour. Deletion is therefore a
-- privileged operation that suspends those triggers for the duration of one
-- transaction, scoped to a single user.

create or replace function orbit.delete_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = orbit, public, pg_catalog
as $$
begin
  if p_user_id is null then
    raise exception 'orbit: delete_user_data requires a user id';
  end if;

  -- session_replication_role = replica disables user triggers for this
  -- transaction only. Deliberate, audited, and the sole sanctioned bypass of
  -- the ledger's append-only guarantee.
  set local session_replication_role = replica;

  delete from payment_allocation where user_id = p_user_id;
  delete from accrual_segment      where user_id = p_user_id;
  delete from accrual_period       where user_id = p_user_id;
  delete from ledger_event         where user_id = p_user_id;
  delete from borrower_note        where user_id = p_user_id;
  delete from document             where user_id = p_user_id;
  delete from notification         where user_id = p_user_id;
  delete from reminder             where user_id = p_user_id;
  delete from push_subscription    where user_id = p_user_id;
  delete from loan_balance         where user_id = p_user_id;
  delete from loan_terms           where user_id = p_user_id;
  delete from loan                 where user_id = p_user_id;
  delete from borrower             where user_id = p_user_id;
  delete from portfolio_snapshot   where user_id = p_user_id;
  delete from engine_run           where user_id = p_user_id;
  delete from portfolio            where user_id = p_user_id;
  delete from user_settings        where user_id = p_user_id;
  delete from "user"               where id = p_user_id;

  set local session_replication_role = origin;
end;
$$;

revoke all on function orbit.delete_user_data(uuid) from public;

comment on function orbit.delete_user_data is
  'Hard-deletes every row belonging to a user. The only sanctioned bypass of ledger immutability; never callable by orbit_app.';
