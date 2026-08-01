-- Orbit — 003_indexes.sql
-- Indexes Prisma's schema language cannot express: partial, trigram, and
-- expression indexes. These back the specific queries named in the PRD's
-- performance budget (P-06 dashboard p95 < 300ms, P-07 60fps at 10k events).
--
-- Apply after every `prisma migrate deploy`. Idempotent.
-- CONCURRENTLY is deliberately omitted so this file can run inside the same
-- transaction as a migration; see docs/03-database-schema.md §9 for the
-- zero-downtime variant used against a live database.

-- ===========================================================================
-- 1. Search                                            (PRD B-02, T-04)
-- ===========================================================================
-- Trigram indexes make ILIKE '%raj%' index-backed rather than a sequential scan.

create index if not exists borrower_full_name_trgm
  on borrower using gin (full_name gin_trgm_ops);

create index if not exists borrower_phone_trgm
  on borrower using gin (phone gin_trgm_ops)
  where phone is not null;

create index if not exists ledger_event_note_trgm
  on ledger_event using gin (note gin_trgm_ops)
  where note is not null;

create index if not exists borrower_tags_gin
  on borrower using gin (tags);

-- ===========================================================================
-- 2. Hot list queries
-- ===========================================================================

-- Borrower directory excludes archived rows on every load. (PRD B-01)
create index if not exists borrower_active_by_name
  on borrower (portfolio_id, full_name)
  where archived_at is null;

-- "Who needs attention" — the default segment. (Phase 2 §6.2)
create index if not exists borrower_needs_attention
  on borrower (portfolio_id, status)
  where archived_at is null and status in ('OVERDUE', 'DUE_SOON');

-- Open loans only. Closed loans are a small minority of reads.
create index if not exists loan_open_by_portfolio
  on loan (portfolio_id, status)
  where status in ('ACTIVE', 'DUE', 'OVERDUE');

-- Collections Due and the overdue counters on the dashboard. (PRD D-05, D-06)
create index if not exists accrual_period_unsettled
  on accrual_period (portfolio_id, due_on, status)
  where status in ('DUE', 'OVERDUE', 'PARTIAL');

-- Upcoming Collections, next 30 days. (PRD D-12)
create index if not exists accrual_period_upcoming
  on accrual_period (portfolio_id, due_on)
  where status = 'UPCOMING';

-- Today's Tasks and the notification badge. (PRD D-11, R-10)
create index if not exists reminder_pending_by_due
  on reminder (portfolio_id, due_on)
  where status in ('PENDING', 'SNOOZED');

create index if not exists notification_unread
  on notification (user_id, created_at desc)
  where read_at is null;

-- ===========================================================================
-- 3. Ledger traversal
-- ===========================================================================

-- The transaction timeline pages on (occurred_at desc, seq desc). Excluding
-- reversed events keeps the common view's index dense.
create index if not exists ledger_event_active_timeline
  on ledger_event (portfolio_id, occurred_at desc, seq desc)
  where reverses_event_id is null;

-- Balance recomputation replays a loan's events in ledger order.
create index if not exists ledger_event_loan_replay
  on ledger_event (loan_id, seq);

-- Monthly roll-ups scan a date window across the portfolio. (PRD A-15)
--
-- Deliberately a plain composite index rather than an expression index on
-- date_trunc('month', occurred_at): date_trunc over timestamptz is STABLE, not
-- IMMUTABLE, because its result depends on the session TimeZone, so Postgres
-- rejects it in an index expression. Pinning it to UTC would make it indexable
-- but would then bucket months in the wrong timezone for the user.
--
-- Roll-up queries must therefore express the month as a half-open range
-- (occurred_at >= start AND occurred_at < next_start) computed in the user's
-- timezone by the caller. That is a range scan this index serves directly.
create index if not exists ledger_event_month_bucket
  on ledger_event (portfolio_id, occurred_at, type);

-- Receipts awaiting allocation to an accrual period.
create index if not exists ledger_event_receipts
  on ledger_event (loan_id, occurred_at)
  where type in ('INTEREST_RECEIVED', 'PRINCIPAL_RECEIVED');

-- ===========================================================================
-- 4. Analytics
-- ===========================================================================

-- Top Borrowers by interest contributed. (PRD A-07)
create index if not exists ledger_event_borrower_interest
  on ledger_event (borrower_id, occurred_at)
  where type = 'INTEREST_RECEIVED';

-- Trailing-window snapshot reads. (PRD A-11)
create index if not exists portfolio_snapshot_window
  on portfolio_snapshot (portfolio_id, period_month desc);

-- ===========================================================================
-- 5. Integrity support
-- ===========================================================================

-- Backs the ON CONFLICT used by idempotent reminder generation. (PRD R-09)
create unique index if not exists reminder_dedupe
  on reminder (user_id, dedupe_key);

-- Exactly one default portfolio per user.
create unique index if not exists portfolio_one_default
  on portfolio (user_id)
  where is_default and archived_at is null;

-- Duplicate document detection within a portfolio.
create index if not exists document_sha_lookup
  on document (portfolio_id, sha256)
  where sha256 is not null;
