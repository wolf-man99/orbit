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

### `prisma generate` is part of the build, not part of install

The first real deployment failed to compile:

```
./src/composition/session.ts:126:31
Type error: Parameter 'period' implicitly has an 'any' type.
```

`pnpm typecheck` had been green locally for four phases. The cause is a chain worth stating in full, because every link is silent:

1. **Prisma 7 no longer generates the client on install.** Nothing in the repo ran `prisma generate` during a build, so on a fresh checkout `node_modules/.prisma/client` does not exist.
2. `@prisma/client`'s shipped `default.d.ts` is one line: `export * from '.prisma/client/default'` — a re-export of the file that was never generated.
3. **`skipLibCheck: true` suppresses the resulting error**, because it lives inside a `.d.ts` under `node_modules`. TypeScript reports nothing and every export of the module degrades to `any`.
4. `any` propagates through `PrismaClient` → `TenantDb` → `db.accrualPeriod.findMany()` → `periods`, and `periods.map((period) => …)` finally trips `noImplicitAny` — nine errors across four files, of which Next.js prints the first.

Locally it passed for one reason only: a generated client from an earlier manual `prisma generate` was sitting in the pnpm store. **The local check was reading an artifact that CI never produces.** Removing that directory reproduces all nine errors exactly.

**The first fix was incomplete.** Prepending `prisma generate &&` to the `build` and `typecheck` scripts in `package.json` fixed it locally and in CI — but the deployment failed again with the identical error, because `vercel.json` sets `"framework": "nextjs"` without an explicit `buildCommand`. Vercel is free to resolve its own default build step for a recognised framework rather than running the project's `build` script, and calling `next build` directly reproduces the exact same failure. Whichever command Vercel actually runs, it was not the one carrying the fix.

The correct hook is **`postinstall`**, which runs unconditionally after `pnpm install` on every platform, regardless of what build command follows it — this is Prisma's own documented recommendation for Vercel:

```jsonc
"scripts": {
  "postinstall": "prisma generate"
}
```

Verified two ways: `pnpm install` alone regenerates the client with no other script involved, and calling bare `npx next build` immediately afterward — the same command that failed twice — now compiles clean. `prisma generate` needs no database connection either way; verified with `DATABASE_URL`, `DIRECT_URL`, and `SHADOW_DATABASE_URL` all unset.

This is the third appearance of one pattern, after the schema validated as a scratch copy in Phase 4 and the empty `migrations/` directory in §10: **a verification that reads a different artifact than production does is not a verification.** Here it was worse than useless twice over — first `skipLibCheck` converted a missing dependency into `any` so the type system reported success precisely where it had stopped checking; then a fix verified against the *wrong command* reported success while the actual deploy path was untouched.

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
| 00:30 daily | `0 19 * * *` — previous day | snapshot roll-up |
| 02:00 daily | `30 20 * * *` — previous day | risk recompute |
| Mon 02:30 | `0 21 * * 0` — Sunday | retention prune |

This is the same trap as the `date_trunc` index in Phase 3 and the month bucketing in Phase 11: treating UTC as "the" calendar silently produces wrong answers for every user outside it. A reminder job firing at 06:00 UTC reaches an Indian user at 11:30, after they have already wondered why nothing arrived.

**Snapshot roll-up was originally hourly.** Vercel's Hobby plan rejects any cron expression that fires more than once a day, which surfaces only at deploy time, not locally. It now runs once daily, 15 minutes after `accrual` completes, so the day's snapshot reflects that day's posted interest rather than racing it. The tradeoff is coarser trend granularity — once a day instead of every hour — reversible by upgrading to Pro and restoring `0 * * * *` if intra-day granularity is ever needed.

### Two ways a cron can appear to run and do nothing

Both were live in `vercel.json` and neither fails a build:

- **Four of the five declared paths had no route.** `accrual`, `snapshots`, `risk`, and `prune` were scheduled against URLs that returned 404. The schedule was valid, so Vercel accepted it; the jobs simply never existed. All five routes now exist.
- **Vercel Cron issues `GET`.** The one route that did exist exported only `POST`, so the scheduler would have received 405 on every invocation. Every job route now exports both — `GET` for the scheduler, `POST` for a manual trigger — from one shared handler in `src/app/api/jobs/_handler.ts` so the two cannot drift apart again.

Verified against a production build: all five return `200` with `Authorization: Bearer $CRON_SECRET`, and `403` with a wrong secret or none.

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
- [ ] `/` redirects to `/dashboard` and returns `200` — there is no content at the root path itself; see the note below
- [ ] `/dashboard` renders with real data and a dated `as of`
- [ ] Record a payment; confirm one round trip returns balance and resolved reminders
- [ ] Replay the same idempotency key; confirm `200` and **no second event**
- [ ] Cron endpoints reject a wrong `CRON_SECRET` with `403`
- [ ] Service worker registers; queue a payment offline and confirm it syncs
- [ ] Logs contain identifiers and no names, amounts, or notes

**Rollback:** revert the Vercel deployment. Schema migrations are forward-only; the ledger is append-only, so no data is lost by rolling the application back to a prior build.

### The root path had no page

Every screen lives under a route group — `(app)/dashboard`, `(app)/analytics`, and so on — and none of those groups produce a route at `/` itself; route groups exist precisely so their folder name is not part of the URL. Nothing filled the gap, so the first production deployment served the framework's default `404` at the exact URL a visitor opens first. Every other route worked; only the root was missing, which is why it surfaced after `build` was already fixed and passing.

`src/app/page.tsx` now redirects `/` to `/dashboard`. It is a redirect rather than a rendered page because sign-in has no screen yet (Q45) — this matches the fallback the rest of the app already uses, where an unauthenticated read resolves against the demo identity rather than gating on a login the UI cannot yet present. Once Q45 closes, this is the file that should start branching on session state.

Verified against a production server (`next build` + `next start`), not just the build log: `GET /` returns `307` to `/dashboard`, and following the redirect returns `200`.

---

## 10. Provisioning

`pnpm db:provision` runs the five steps of §2 in order, each a gate that stops the run rather than letting a later step report success on a broken foundation.

Running it against an empty database found a gap that had been invisible for eleven phases: **`prisma/migrations/` was empty.** Every earlier verification had applied the schema via `migrate diff` to a scratch file, so a real `migrate deploy` would have created no tables at all. The initial migration is now committed, and the full run was verified from an empty database through to the RLS check.

The script never writes the generated password to a file and never passes it in a `psql` argument list, where `ps` would expose it to every process on the host — it goes over stdin.

### `pnpm db:provision:api` — same gates, different transport

Supabase's direct database host resolves to IPv6 only, and many sandboxes, CI runners, and corporate networks allow HTTPS egress but not raw TCP on 5432. `scripts/provision-via-api.mjs` runs the identical five gates over the Supabase Management API (`POST /v1/projects/{ref}/database/query`) instead of the Postgres wire protocol. Two differences worth knowing:

- psql meta-commands (`\set`) are client directives the server rejects, so they are stripped. `ON_ERROR_STOP` is not lost — the API fails the request on any error, which is the same thing.
- Migrations are recorded in `_prisma_migrations` with the **real sha256 of the migration file**. A placeholder checksum would make a later `prisma migrate deploy` refuse to run, claiming an applied migration had been edited.

## 11. What the hosted run found (Q46)

Provisioning a real Supabase project is where Q46 stopped being a caveat. Two failures surfaced that eleven phases of local Postgres could not, and both share a cause: **the local verification connects as a superuser and the hosted one does not.** Supabase's `postgres` role is `CREATEROLE`, not `SUPERUSER`.

| Gate | Failure on the hosted instance | Fix |
| --- | --- | --- |
| 3 — ledger invariants | `permission denied to set role "orbit_app"` | The suite proves RLS by *becoming* `orbit_app`. A superuser may do that unconditionally; a managed owner may not, so the entire RLS half of the acceptance test was unrunnable. `002_rls.sql` now grants the role to the owner `with inherit false, set true` — the ability to assume it, none of its privileges. |
| 4 — application role | `Only roles with the SUPERUSER attribute may alter roles with the SUPERUSER attribute` | `alter role orbit_app nosuperuser … nobypassrls` requires superuser *even to clear the attributes*. `CREATE ROLE` leaves both off, so the statement was a no-op that nonetheless aborted provisioning. It is now conditional on the attributes actually being set, and the verification block raises on `rolsuper` as well as `rolbypassrls` so a role that needs the repair and cannot get it still fails loudly. |

This is the same lesson as the empty `migrations/` directory in §10, in a different costume: a verification that runs under more privilege than production does not verify production.

### Result

All five gates pass against project `uzptbzjreilmtrpxfawx` (PostgreSQL 17.6):

```
tables 19 · policies 21 · triggers 17 · indexes 85
orbit_app:  bypasses RLS false · superuser false · can login true · owns 0 tables
```

Nineteen of nineteen `public` tables have RLS enabled. Eighteen are the schema; the nineteenth is `_prisma_migrations`, which ends up with RLS on and **no policy at all** — deny-by-default, and `orbit_app` holds no `SELECT` on it. That is the correct outcome rather than an oversight.

The `auth.users` trigger branch of `004_auth_bridge.sql` **executed for the first time.** Every prior run printed *"auth.users not found — skipping"*; `on_auth_user_created` now exists on `auth.users`, so a Supabase signup calls `orbit.bootstrap_user()` and lands a portfolio.

The same edits were re-verified against local Postgres 16 afterwards, including a negative control: granting `BYPASSRLS` to `orbit_app` and confirming `005` repairs it rather than reporting success. All 27 invariants still hold on both engines.

**What remains unproven:** no application process has connected *as* `orbit_app` over the wire — this container has neither IPv6 egress nor raw TCP to 5432, so pgBouncer, the pooled connection string, and `SET LOCAL app.user_id` under pgBouncer are still untested against the hosted instance. RLS itself is proven, since the invariants suite evaluates the policies under that exact role.

## 12. Auth wiring (Q41)

Sign-in, verify, sign-out, and the payment route are bound. Session resolution lives in the composition root, since it needs both `infrastructure/auth` and `application`.

| Decision | Reasoning |
| --- | --- |
| Sign-in returns success whether or not the address exists | Otherwise the endpoint is an account-existence oracle |
| Verify failures are generic | A specific message reveals whether the address is registered |
| The portfolio id is resolved from the session, never a parameter | An endpoint accepting one would make every tenancy control bypassable by editing a body |
| A split receipt suffixes its idempotency key per posting | Two events are written and the unique constraint is on `(userId, idempotencyKey)` |
| Without Supabase configured, a fixed demo identity is used | The product stays reviewable; reads fall back to the seeded source |

**Exercising the endpoint found a bad failure mode.** With no database configured, recording a payment threw into a bare `500` with an empty body. Reads legitimately fall back to the seeded source, but a *write* has nowhere to land, and a payment the user believes was recorded and was not is the worst outcome this product can produce. It now returns `503` with an explicit sentence — *"Nothing was saved."* Constraint violations are caught and returned as `INVARIANT` sentences rather than SQLSTATEs.

## 13. Remaining

| # | Item | Note |
| --- | --- | --- |
| Q42 | Document upload has contracts but no storage adapter | Supabase Storage binding |
| Q43 | Job endpoints return stubs | All five routes now exist, authenticate, and answer the scheduler's `GET` — but they report zero work. The engines behind them are implemented and tested; the per-tenant loop that calls them is not written. |
| Q44 | No load testing against the P-06/P-07 budgets | Needs a seeded database at realistic volume |
| Q45 | Sign-in and verify have no UI | The routes work; the screens are not built |
| Q46 | ~~Nothing has run against a hosted Supabase project~~ | **Closed** — see §11. Schema, RLS, invariants, the application role, and the `auth.users` trigger are all applied and verified on a live project. |
| Q47 | No process has connected as `orbit_app` over the wire | Opened by closing Q46. The pooled connection string and `SET LOCAL app.user_id` through pgBouncer need an environment with TCP egress to Supabase. |

**Q47 is now the honest limit of what has been proven.** The policies are proven under the runtime role; the runtime *connection* is not.

---

*End of Phase 14.*
