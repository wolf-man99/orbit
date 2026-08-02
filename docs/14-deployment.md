# Orbit — Deployment

**What Moves, Grows**

| Field | Value |
| --- | --- |
| Product | Orbit |
| Document | Phase 14 — Deployment |
| Version | 1.0 |
| Status | Delivered |
| Depends on | Phases 1–13 |
| Verified | 231 unit tests · 28 E2E · 27 ledger invariants · RLS runtime check proven to fail on an exempt connection |

---

## 1. The deployment risk that matters

Everything else in this phase is configuration. One thing is not:

> **A correct-looking set of RLS policies attached to a connection that is exempt from them.**

Phase 3 established that RLS does not apply to a table's owner, and that a default Supabase connection string authenticates as `postgres` — the owner. Every policy would be present in the schema, readable in review, and completely inert at runtime. Nothing in the application would behave differently. The first symptom would be one user seeing another's borrowers.

This cannot be verified by reading the schema. It can only be verified by connecting **as the application does** and observing what that connection is.

`scripts/verify-rls.mjs` does exactly that, and runs in CI:

```
  connected as   postgres          →  ✗ holds BYPASSRLS
                                      ✗ is a superuser
                                      ✗ owns 18 tables
                                      ✗ must use orbit_app          exit 1

  connected as   orbit_app         →  bypasses RLS  f
                                      superuser     f
                                      owns tables   0               exit 0
```

Both outcomes were verified against a live Postgres before this was relied on.

`prisma/sql/005_app_role.sql` provisions the role and self-verifies, refusing to report success if `orbit_app` holds `BYPASSRLS` or owns any table. It is deliberately **separate** from the idempotent `002_rls.sql` that runs on every deploy, because a password must not be rewritten by a routine migration.

---

## 2. Release order

Order is not incidental. Each step depends on the last.

```bash
# 1. Schema
pnpm db:deploy          # prisma migrate deploy   (DIRECT_URL, owner role)

# 2. Integrity, security, indexes — idempotent, every deploy
pnpm db:sql             # prisma/sql/00{1,2,3,4}.sql in order

# 3. The gate: 27 assertions over the ledger's guarantees
pnpm db:verify          # fails the deploy if a migration broke an invariant

# 4. Once per environment, by a superuser
psql "$DIRECT_URL" -v password="$(openssl rand -base64 32)" \
  -f prisma/sql/005_app_role.sql

# 5. Prove the runtime connection is governed by RLS
pnpm db:verify-rls      # against DATABASE_URL, not DIRECT_URL

# 6. Application
pnpm build && pnpm size
```

Steps 1–3 are `pnpm db:release`. A migration that breaks a ledger invariant fails the deploy rather than reaching production.

---

## 3. Environment

| Variable | Role | Note |
| --- | --- | --- |
| `DATABASE_URL` | Runtime | **Must** authenticate as `orbit_app`. Pooled, port 6543. |
| `DIRECT_URL` | Migrations | Owner role, unpooled, port 5432. Never used at runtime. |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Auth | Public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Bypasses RLS. Never in a client bundle. |
| `CRON_SECRET` | Jobs | Compared in constant time — a cron endpoint is a public URL |
| `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push | |

**Region:** `bom1` (Vercel) co-located with `ap-south-1` (Supabase), so the database round trip does not consume the p95 latency budget for the primary audience.

---

## 4. Cron is UTC; the product is not

Vercel evaluates cron in UTC. Every schedule in `vercel.json` is written by converting from IST, **including the day shift** for times before 05:30 local:

| Intent (IST) | UTC | Job |
| --- | --- | --- |
| 00:15 daily | `45 18 * * *` — previous day | accrual materialisation |
| 06:00 daily | `30 0 * * *` | reminder generation |
| hourly | `0 * * * *` | snapshot roll-up |
| 02:00 daily | `30 20 * * *` — previous day | risk recompute |
| Mon 02:30 | `0 21 * * 0` — Sunday | retention prune |

This is the same trap as the `date_trunc` index in Phase 3 and the month bucketing in Phase 11: treating UTC as "the" calendar silently produces wrong answers for every user outside it. A reminder job firing at 06:00 UTC reaches an Indian user at 11:30, after they have already wondered why nothing arrived.

---

## 5. Security headers

CSP is set in `src/middleware.ts`, not `vercel.json`, because it needs a **per-request nonce**. A static policy would have to allow `'unsafe-inline'` for Next's bootstrap script, which defeats most of the point of having one.

`connect-src` names Supabase explicitly rather than using a wildcard: an exfiltration path is a `connect-src` the policy forgot to close.

Static assets and `/sw.js` are excluded from the matcher — a service worker served under a nonce-bearing CSP cannot register.

---

## 6. Gaps closed in this phase

| # | Gap | Resolution |
| --- | --- | --- |
| **Q38** | `databaseSource` returned empty `principalEvents`, so the engine had no basis and every loan would have accrued **zero against real data** | Batched into one query (`principalEventsFor`) and grouped in memory rather than N queries inside the tenant transaction. `REVERSAL` and `ADJUSTMENT` are included, because a reversed disbursement must remove its principal or the engine keeps accruing on money never lent. |
| **Q39** | Auth adapter had no implementation | Supabase adapter bound. Uses `getUser()`, not `getSession()`: a session is read from a client-controlled cookie, whereas `getUser` revalidates against Supabase. Trusting the cookie would make every tenancy control bypassable by editing it. |
| **Q40** | Only CSV of three contracted formats | SpreadsheetML and PDF added, both dependency-free. See §7. |

**Q38 was a correctness hole, not a missing feature.** A shape-correct source that silently computes zero is worse than one that fails, because it looks like a portfolio rather than an error. `tests/unit/port-contract.test.ts` now asserts what a source must supply, with the failure mode itself as a named test.

---

## 7. Report formats without dependencies

| Format | Approach | Why |
| --- | --- | --- |
| CSV | Hand-written, with formula escaping | Fields beginning `=`, `+`, `-`, `@` are quote-prefixed. Spreadsheets treat those as **formulas**, and a financial export is precisely the file a user opens without thinking. |
| Spreadsheet | SpreadsheetML 2003, a single XML file | Opens natively in Excel, Numbers, and LibreOffice. A real `.xlsx` is a ZIP container needing a library; this needs none. Every cell declares its type, so no formula escaping is required — a typed cell is never reinterpreted. |
| PDF | Written directly | A statement is a table of numbers; a headless browser is a large dependency and a large attack surface for that. Output is **byte-identical across runs**, which matters when a user compares two statements. |

---

## 8. Observability

Structured JSON logs with **default-deny redaction**: an unrecognised key is redacted rather than logged, so adding a column can never silently start leaking it. Every `bigint` is dropped outright, because every `bigint` in this system is money.

Redaction happens at the logger, not the call site. Relying on every caller to remember is how leaks happen, and a leaked log is not revocable.

**Three alert conditions** indicate the ledger's guarantees are under stress rather than ordinary noise, and should page:

1. An `INVARIANT` error reached production.
2. A parked offline mutation is older than 24 hours.
3. `loan_balance.last_event_seq` lags `max(ledger_event.seq)` for any loan.

---

## 9. Release checklist

**Before**
- [ ] `pnpm verify` green (typecheck, lint, boundaries, contrast, 231 tests)
- [ ] `pnpm test:e2e` green (28, mobile and desktop)
- [ ] `pnpm db:release` green against a preview branch
- [ ] `pnpm db:verify-rls` exits 0 for `DATABASE_URL` — **the single most important check**
- [ ] `pnpm size` within 180 kB
- [ ] `DATABASE_URL` authenticates as `orbit_app`, not `postgres`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` absent from every client bundle
- [ ] PITR enabled; a restore has been performed at least once

**After**
- [ ] `/dashboard` renders with real data and a dated `as of`
- [ ] Record a payment; confirm one round trip returns balance and resolved reminders
- [ ] Replay the same idempotency key; confirm `200` and **no second event**
- [ ] Cron endpoints reject a wrong `CRON_SECRET` with `403`
- [ ] Service worker registers; queue a payment offline and confirm it syncs
- [ ] Logs contain identifiers and no names, amounts, or notes

**Rollback:** revert the Vercel deployment. Schema migrations are forward-only; the ledger is append-only, so no data is lost by rolling the application back to a prior build.

---

## 10. Remaining

| # | Item | Note |
| --- | --- | --- |
| Q41 | Route handlers are not yet bound to the auth adapter or to `recordPayment` | The service, contracts, adapter, and composition root all exist; wiring is mechanical |
| Q42 | Document upload has contracts but no storage adapter | Supabase Storage binding |
| Q43 | Job endpoints return stubs | The engines they call are implemented and tested |
| Q44 | No load testing against the P-06/P-07 budgets | Needs a seeded database at realistic volume |

None of these is a design question. Each is wiring against an interface that exists and is tested.

---

*End of Phase 14.*
