# Orbit

**What Moves, Grows**

A Personal Capital Operating System for private lenders — institutional-grade visibility over a private lending portfolio, in software that feels like it belongs on a well-kept desk rather than in an accounting department.

Orbit is built on an append-only ledger with a separate accrual engine, so it answers the questions a loan tracker cannot: what is genuinely overdue versus merely not yet due, what the blended yield actually is, where capital is over-concentrated, and what is arriving next month.

## Status

Phases 1–14 delivered. See [`docs/`](./docs/README.md); implementation notes and
known gaps are in [Phases 9–13](./docs/09-13-implementation.md).

```
pnpm verify           typecheck · lint · boundaries · contrast · 231 unit tests
pnpm test:e2e         28 critical-path tests
pnpm db:verify        27 ledger invariants against Postgres
pnpm db:verify-rls    proves RLS governs the runtime connection
pnpm db:provision     schema, policies, invariants, app role — five gates, in order
pnpm db:provision:api the same five gates over the Supabase Management API
```

The schema, policies, ledger invariants, application role, and the `auth.users`
bootstrap trigger are applied and verified on a live Supabase project
(PostgreSQL 17.6) as well as local Postgres 16 — see
[Phase 14 §11](./docs/14-deployment.md).

## Intended stack

Next.js (App Router) · TypeScript · TailwindCSS · shadcn/ui · Supabase · Prisma · Recharts · Framer Motion · TanStack Query · Zod · PWA
