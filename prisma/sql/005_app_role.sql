-- Orbit — 005_app_role.sql
-- Provisions the runtime login role. Run ONCE per environment, by a superuser.
--
-- ---------------------------------------------------------------------------
-- This file is the difference between RLS working and RLS being decoration.
-- ---------------------------------------------------------------------------
-- 002_rls.sql creates `orbit_app` NOLOGIN and grants it table privileges, but a
-- role that cannot log in cannot be connected as. Until the password below is
-- set and DATABASE_URL points at it, the application connects as the OWNER —
-- and RLS does not apply to a table's owner. Every policy would be silently
-- inert while appearing correct in the schema.
--
-- Usage:
--   psql "$DIRECT_URL" -v password="$(openssl rand -base64 32)" -f 005_app_role.sql
--
-- Then set DATABASE_URL to connect as orbit_app, NOT as postgres.

\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'orbit_app') then
    create role orbit_app nologin;
  end if;
end
$$;

-- LOGIN plus a password. Deliberately separate from 002_rls.sql, which is
-- idempotent and runs on every deploy: a password must not be rewritten by a
-- routine migration.
alter role orbit_app with login password :'password';

-- orbit_app owns nothing and holds no BYPASSRLS. Stated explicitly rather than
-- assumed, because inheriting either would disable every policy.
alter role orbit_app nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

-- It may not create objects; it only reads and writes rows the policies allow.
revoke create on schema public from orbit_app;
grant usage on schema public, orbit to orbit_app;

-- Connection ceiling, so a runaway deploy cannot exhaust the pool and lock out
-- migrations.
alter role orbit_app connection limit 40;

-- ---------------------------------------------------------------------------
-- Verification — fails loudly rather than reporting success on a broken setup
-- ---------------------------------------------------------------------------
do $$
declare
  can_bypass boolean;
  owns_tables integer;
begin
  select rolbypassrls into can_bypass from pg_roles where rolname = 'orbit_app';
  if can_bypass then
    raise exception 'orbit_app holds BYPASSRLS — every row-level policy would be inert';
  end if;

  select count(*) into owns_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_roles r on r.oid = c.relowner
  where n.nspname = 'public' and c.relkind = 'r' and r.rolname = 'orbit_app';

  if owns_tables > 0 then
    raise exception 'orbit_app owns % table(s) — an owner is exempt from RLS', owns_tables;
  end if;

  raise notice 'orbit_app provisioned: no BYPASSRLS, owns no tables, RLS applies.';
end
$$;
