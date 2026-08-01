# Orbit — Folder Structure

**What Moves, Grows**

| Field | Value |
| --- | --- |
| Product | Orbit |
| Document | Phase 5 — Folder Structure |
| Version | 1.0 |
| Status | Awaiting approval |
| Depends on | [Phase 4 — System Architecture](./04-system-architecture.md) |
| Verified | 7/7 boundary rules fire on injected violations · typecheck clean · invariant gate exits 1 on regression |

---

## 1. What this phase delivers

A directory tree is a diagram until something enforces it. This phase delivers the tree **and** the tooling that makes Phase 4's dependency rule fail a build.

| Artifact | Purpose |
| --- | --- |
| `src/**` | 80 directories, 31 files — four layers plus eight feature modules |
| `.dependency-cruiser.cjs` | The dependency rule, executable |
| `eslint.config.mjs` | Domain purity and money-safety rules |
| `tsconfig.json` | Strict mode with the four strictest optional flags on |
| `package.json` | Scripts, dependencies, bundle budget |
| `.github/workflows/ci.yml` | Three gates: verify, ledger invariants, bundle budget |
| `scripts/apply-sql.mjs` · `scripts/verify-invariants.mjs` | Phase 3's SQL layer wired into CI |

**Verification performed:**

```
✓ pnpm install               all dependencies resolve
✓ pnpm typecheck             clean under strict + 4 extra flags
✓ pnpm boundaries            no violations (31 modules, 11 dependencies)
✓ 7/7 boundary rules fire    on deliberately injected violations
✓ pnpm db:sql                4 files applied, idempotent
✓ pnpm db:verify             27 invariants hold; exits 1 when one is broken
```

---

## 2. Single application, not a monorepo

The engine's purity guarantee (PRD E-13) argues for a workspace package whose `package.json` literally has no dependencies. I chose a single application instead.

| | Monorepo package | **Single app + enforced boundaries** |
| --- | --- | --- |
| Engine purity | Structural | Enforced by `domain-has-no-runtime-deps`, verified to fire |
| Client bundling | Needs `transpilePackages` | Works directly, tree-shakes |
| Tooling overhead | Two installs, two tsconfigs, version drift | One of each |
| Deployables | Still one | One |

A workspace boundary for a product with a single deployable buys ceremony, not safety — provided the boundary is enforced, which §4 demonstrates it is.

**The extraction path is kept open.** Everything imports through path aliases (`@/domain/engine`). Extracting the engine later is a `git mv` plus a `package.json`, with the alias remapped to `@orbit/engine` in one file. No import statement changes.

---

## 3. The tree

```
orbit/
├── .github/workflows/ci.yml
├── docs/                          phase deliverables
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── sql/                       integrity layer + invariant tests
├── scripts/                       apply-sql · verify-invariants
├── public/                        icons, manifest, service worker
│
├── src/
│   ├── domain/                    ← LAYER 1 · pure, zero dependencies
│   │   ├── money/                 Minor, MicroMinor, BasisPoints, Money
│   │   ├── time/                  PlainDate, TimeZone
│   │   ├── engine/
│   │   │   ├── interest/          accrual computation (PRD §7)
│   │   │   ├── allocation/        oldest-first settlement (E-11)
│   │   │   ├── risk/              borrower risk model (BP-05)
│   │   │   ├── health/            portfolio health composite (D-10)
│   │   │   └── forecast/          cash-flow projection (A-10)
│   │   ├── models/                entity types
│   │   ├── schemas/               Zod schemas — one source of truth (ENG-03)
│   │   └── errors.ts              DomainError, Result
│   │
│   ├── application/               ← LAYER 2 · use cases, framework-agnostic
│   │   ├── ports/                 Clock, IdGenerator, DocumentStorage, PushSender
│   │   ├── services/              orchestration; owns transaction boundaries
│   │   ├── commands/              write use cases
│   │   ├── queries/               read use cases / loaders
│   │   └── cache/tags.ts          tag taxonomy + invalidationTagsFor
│   │
│   ├── infrastructure/            ← LAYER 3 · adapters
│   │   ├── db/                    withTenant + repositories  ⚠ Prisma lives ONLY here
│   │   ├── auth/                  Supabase Auth
│   │   ├── storage/               documents, signed URLs
│   │   ├── push/                  Web Push / VAPID
│   │   ├── jobs/                  accrual · reminders · snapshots · risk
│   │   ├── reports/               CSV · Excel · PDF
│   │   └── observability/         logger (PII-redacting), metrics, tracing
│   │
│   ├── app/                       ← LAYER 4 · routes only, no logic
│   │   ├── (app)/                 dashboard · borrowers · loans · transactions
│   │   │                          · analytics · notifications · reports · settings
│   │   ├── (auth)/                sign-in · verify
│   │   ├── (fullscreen)/          onboarding · locked
│   │   └── api/{v1,jobs}/         mutations (replayable) · cron
│   │
│   ├── features/                  ← LAYER 4 · feature modules
│   │   └── <feature>/
│   │       ├── components/        feature-private
│   │       ├── hooks/             feature-private
│   │       ├── loaders.ts         server-side reads via application
│   │       ├── schemas.ts         feature-specific validation
│   │       └── index.ts           ⚠ the ONLY cross-feature import surface
│   │
│   ├── components/                shared: ui · layout · data · motion · feedback
│   ├── hooks/                     shared hooks
│   ├── lib/                       cross-cutting client utilities
│   ├── offline/                   write queue + service worker
│   └── styles/                    tokens, globals
│
└── tests/                         unit · integration · e2e · fixtures
```

### 3.1 Why routes hold no logic

`src/app` contains route files and nothing else — each one wires a loader to a component. Business logic in a route file is untestable without a request, and unreusable when the same data is needed on a second screen. Loaders live in `features/*/loaders.ts`; use cases live in `application`.

### 3.2 Why features and layers coexist

PRD ENG-02 asks for feature-based architecture; Phase 4 established four layers. These are orthogonal axes, not competing schemes:

- **Layers** are about *dependency direction* — what may import what.
- **Features** are about *cohesion* — what changes together.

Features exist inside the presentation layer. A feature may reach into `application` and `domain`; it may not reach into `infrastructure`, and it may reach another feature only through that feature's `index.ts`.

---

## 4. Enforcement

Seven rules, each verified to fire by injecting a deliberate violation and observing the failure.

| Rule | Forbids | Why |
| --- | --- | --- |
| `domain-is-pure` | domain → any other layer | Financial correctness is proved in domain; it stays provable only in isolation |
| `domain-has-no-runtime-deps` | domain → any npm package | Zero dependencies is what lets the engine run unchanged on server and client |
| `application-does-not-know-infrastructure` | application → infrastructure | Otherwise ports are decorative and PRD §12's seams stop existing |
| `application-imports-no-react` | application → react/next | Use cases must be testable without a renderer |
| `infrastructure-is-not-presentation` | infrastructure → app/features | Adapters never render |
| `presentation-does-not-reach-past-application` | components → infrastructure | Data access must pass through the tenancy boundary |
| `prisma-client-is-module-private` | anything outside `infrastructure/db` → `@prisma/client` | A stray import is a cross-tenant leak waiting to happen |
| `db-internals-are-private` | reaching past `infrastructure/db/index.ts` | The unscoped client must be unreachable around the side |
| `features-are-islands` | feature → another feature's internals | How a modular codebase quietly becomes a monolith |
| `no-circular` | import cycles | Breaks tree-shaking; makes load order load-bearing |

### 4.1 Two rules were silently inert

Writing the rules is not the same as having them work. Injecting violations revealed two bugs, both of which would have left the codebase apparently protected:

**Prefix matching across layer names.** `^src/app` also matches `src/application`. Four rules used it, so the application layer was being classified as presentation — `application/index.ts` importing its own submodules was reported as a violation, while genuine violations elsewhere were mis-scoped. Every layer pattern is now anchored to a path segment (`^src/app/`).

**npm rules matched a specifier that never appears.** dependency-cruiser evaluates `to.path` against the **resolved** path. An import of `@prisma/client` resolves to `node_modules/.pnpm/@prisma+client@7.9.1_…/node_modules/@prisma/client/default.d.ts`. A pattern anchored on `^@prisma/client` cannot match it, so `prisma-client-is-module-private` — the rule protecting tenancy — never fired. The React rule had the same defect. Both now match on the resolved `node_modules/…` path, and both are verified.

This is the same failure mode as `FORCE ROW LEVEL SECURITY` in Phase 3: a control that reads correctly and does nothing. **A rule that has never been seen to fail is not known to work.** Every rule added later must ship with a violation that proves it.

### 4.2 Lint rules protecting earlier guarantees

Two rule groups exist because ordinary review will not reliably catch these:

| Group | Scope | Bans |
| --- | --- | --- |
| Domain purity | `src/domain/**` | `new Date()`, `Date.now()`, `Math.random()`, `fetch`, `parseFloat` |
| Money safety | all of `src/` | `*` and `/` applied directly to a `*Minor` identifier |

The first makes PRD E-02's determinism structural: `asOf` is an input, never a clock read. The second flags the arithmetic most likely to silently lose precision on a bigint amount.

### 4.3 TypeScript strictness

Beyond `strict: true`, four flags are on that most projects leave off:

| Flag | Catches |
| --- | --- |
| `noUncheckedIndexedAccess` | `array[i]` treated as defined when it may not be |
| `exactOptionalPropertyTypes` | `{ x: undefined }` conflated with `{}` |
| `noPropertyAccessFromIndexSignature` | `process.env.FOO` typos |
| `verbatimModuleSyntax` | Type imports surviving into runtime output |

These are not free — two of them caught real defects in Phase 3's `prisma.config.ts` the moment they were enabled, which is precisely the argument for them.

---

## 5. Conventions

| Concern | Convention |
| --- | --- |
| Directories | `kebab-case` |
| React components | `PascalCase.tsx`, one component per file |
| Everything else | `camelCase.ts` |
| Route files | Next.js reserved names only (`page`, `layout`, `route`, `error`, `loading`) |
| Tests | `*.test.ts` beside the unit under test; integration and e2e under `tests/` |
| Barrels | `index.ts` at every module boundary; **never** inside a module to re-export siblings |
| Imports | Path aliases always (`@/domain/money`); `../..` is a smell and usually a layering error |
| Exports | Named exports; default exports only where a framework demands one |
| Server/client | `'use client'` at the lowest possible point in the tree |

**On barrels:** they mark public surfaces. A barrel that re-exports every file in a directory defeats tree-shaking and turns one import into a whole subtree. Barrels here exist at layer and feature boundaries only.

---

## 6. CI

Three independent jobs, so a failure names its own cause:

| Job | Gates |
| --- | --- |
| **verify** | `typecheck` → `lint` → `boundaries` → `test` |
| **ledger-invariants** | Postgres 16 service → `db:deploy` → `db:sql` → `db:verify` |
| **budget** | `build` → `size` (PRD P-05: 180KB gzipped) |

The invariant job is the one worth dwelling on. It spins up Postgres, applies migrations and the Phase 3 SQL layer, then runs all 27 assertions. **A migration that breaks a ledger guarantee fails the build.** Verified: dropping the append-only trigger makes `pnpm db:verify` exit 1; restoring it returns 0.

Both scripts had bugs that only running them exposed — `psql` writes `RAISE NOTICE` to stderr, so the verifier reading stdout alone saw no results and would have passed a broken database by accident if the completion check had been weaker.

---

## 7. Open questions

| # | Question | Needed by | Default |
| --- | --- | --- | --- |
| Q18 | Should `src/features/*/loaders.ts` be permitted to call `withTenant` directly, or always via an `application` query? | Phase 10 | Always via `application` — keeps the tenancy boundary in one layer |
| Q19 | Do shared `components/ui` primitives get their own tests, or coverage via feature tests? | Phase 13 | Own tests for behaviour, visual review for appearance |
| Q20 | Should the engine's client copy be a separate entry chunk to keep it out of the main bundle? | Phase 8 | Yes — dynamic import, measured against the budget |

---

## 8. Amendments to earlier phases

None. This phase implements Phase 4 §5 without altering it.

Two Phase 3 artifacts were corrected in place: `prisma.config.ts` now uses bracketed `process.env` access and conditional spreading, required by the strict flags enabled here. Behaviour is unchanged.

---

*End of Phase 5.*
