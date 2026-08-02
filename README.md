# Orbit

**What Moves, Grows**

A Personal Capital Operating System for private lenders — institutional-grade visibility over a private lending portfolio, in software that feels like it belongs on a well-kept desk rather than in an accounting department.

Orbit is built on an append-only ledger with a separate accrual engine, so it answers the questions a loan tracker cannot: what is genuinely overdue versus merely not yet due, what the blended yield actually is, where capital is over-concentrated, and what is arriving next month.

## Status

Phases 1–13 delivered. See [`docs/`](./docs/README.md); implementation notes and
known gaps are in [Phases 9–13](./docs/09-13-implementation.md).

```
pnpm verify     typecheck · lint · boundaries · contrast · 177 unit tests
pnpm test:e2e   26 critical-path tests
pnpm db:verify  27 ledger invariants against Postgres
```

## Intended stack

Next.js (App Router) · TypeScript · TailwindCSS · shadcn/ui · Supabase · Prisma · Recharts · Framer Motion · TanStack Query · Zod · PWA
