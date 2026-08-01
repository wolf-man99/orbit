# Orbit — API Design

**What Moves, Grows**

| Field | Value |
| --- | --- |
| Product | Orbit |
| Document | Phase 6 — API Design |
| Version | 1.0 |
| Status | Awaiting approval |
| Depends on | [Phase 3 — Schema](./03-database-schema.md) · [Phase 4 — Architecture](./04-system-architecture.md) · [Phase 5 — Structure](./05-folder-structure.md) |
| Verified | typecheck clean · 16 schema tests pass · boundaries clean (39 modules) |

---

## 1. What this phase delivers

The wire contracts the UI phases will build against, as executable schemas rather than prose.

| Artifact | Purpose |
| --- | --- |
| `src/application/schemas/common.ts` | Money, dates, ids, pagination, sorting |
| `src/application/schemas/transaction.ts` | Ledger commands — the core surface |
| `src/application/schemas/borrower.ts` · `loan.ts` | Entity commands and filters |
| `src/application/http/envelope.ts` | Response envelope, error codes, status mapping |
| `tests/unit/schemas.test.ts` | 16 tests over the contract's sharp edges |
| `vitest.config.ts` | Test runner with a 95% coverage floor on `domain/engine` |

---

## 2. Zod moved out of `domain`

PRD ENG-03 asks for shared Zod schemas as the single source of truth. Phase 5's `domain-has-no-runtime-deps` rule forbids every npm import from `src/domain`, and I had scaffolded `src/domain/schemas/` there. I checked rather than assumed:

```
error domain-has-no-runtime-deps: src/domain/schemas/_probe.ts → zod@4.4.3
```

Schemas now live in `src/application/schemas/`. This is the right home on the merits, not merely a workaround: **validating a wire payload is a use-case concern, not a domain-model concern.** `domain` owns branded types and pure invariants; `application` owns the contract that parses untrusted input into them. Presentation may import `application`, so the schemas remain genuinely shared between client and server.

The alternative — granting Zod an exemption — was rejected because "zero dependencies" is checkable and "zero dependencies except approved ones" is the first step down a slope. The engine's portability is worth more than the convenience.

---

## 3. Principles

| # | Principle | Consequence |
| --- | --- | --- |
| 1 | **Mutations are commands, not resource edits** | `POST /loans/:id/close`, never `PATCH /loans/:id {status}` |
| 2 | **The ledger surface has no PUT and no DELETE** | HTTP verbs mirror the append-only database guarantee |
| 3 | **Idempotency is mandatory on every mutation** | Offline replay is a first-class path, not an edge case |
| 4 | **Money crosses the wire as a string** | A JSON number degrades silently; a string cannot reach floating-point arithmetic |
| 5 | **Cursor pagination only** | Offsets are unusable against a continuously appending ledger |
| 6 | **One envelope for every response** | The client has one parser and one error path |
| 7 | **Derived state is never accepted as input** | Status, balances, and scores are computed; sending them is a 422 |
| 8 | **Mutations return everything needed to reconcile** | The 3-tap payment flow cannot afford a second round trip |

---

## 4. Envelope

**Success**

```json
{
  "data": { "id": "3f25…", "amountMinor": "1000000" },
  "meta": { "requestId": "req_01JQ8Z…", "asOf": "2026-04-14T10:32:00+05:30" }
}
```

**Paginated**

```json
{
  "data": [ … ],
  "meta": {
    "requestId": "req_01JQ8Z…",
    "asOf": "2026-04-14T10:32:00+05:30",
    "cursor": { "next": "eyJvIjoiMjAyNi0wNC0xNCIsInMiOjQyfQ", "hasMore": true }
  }
}
```

**Error**

```json
{
  "error": {
    "code": "INVARIANT",
    "message": "A reversal cannot itself be reversed.",
    "details": [{ "field": "eventId", "message": "event is already a REVERSAL" }],
    "requestId": "req_01JQ8Z…"
  }
}
```

`asOf` is on every success response because PRD D-16 forbids presenting an undated figure. `requestId` is safe to show a user and correlates directly with server logs.

### 4.1 Status mapping

| Domain error | Status | Notes |
| --- | --- | --- |
| `VALIDATION` | 422 | Field-level `details` |
| `NOT_FOUND` | 404 | Never reveals whether a row exists in another tenant |
| `CONFLICT` / `IDEMPOTENT_REPLAY` | **200** | Not an error — see §6 |
| `CONFLICT` / `STATE_CHANGED` | 409 | "This changed while you were away" |
| `INVARIANT` | 422 | Database constraint translated into a sentence |
| `FORBIDDEN` | 403 | Generic body |
| `ENGINE` | 500 | Last-known-good figure still served where possible |

Database constraint violations from Phase 3 surface as `INVARIANT` carrying the constraint name, so the guarantees written in SQL reach the user as plain language rather than a SQLSTATE.

---

## 5. Money on the wire

Amounts are **decimal strings of minor units**: `"amountMinor": "1000000"` means ₹10,000.00.

A single amount would in fact survive as a JSON number — 2⁵³ paise is far above any realistic portfolio. The discipline is kept anyway for two reasons: `JSON.parse` degrades *silently* rather than loudly when the bound is eventually crossed by a sum or a currency with more minor units, and a string can never be accidentally handed to floating-point arithmetic. The test suite pins this:

```ts
const huge = '9007199254740993'            // 2^53 + 1
minorSchema.parse(huge) === 9007199254740993n   // exact
Number(huge).toString() !== huge                // what a JSON number would do
```

Rates cross as integer basis points (`"rateBps": 200`), never as `0.02`.

---

## 6. Idempotency

Every mutation requires an `Idempotency-Key` — a client-generated ULID created **before** the first attempt and reused unchanged on every retry.

| Situation | Response |
| --- | --- |
| New key | `201 Created` + the created resource |
| Replayed key, identical payload | **`200 OK` + the original resource** |
| Replayed key, different payload | `409 Conflict` |

The middle row is the one that matters. A network timeout after a successful write is indistinguishable from a failure at the client, so retry is inevitable. Returning `409` there would show the user a failure for a payment that was in fact recorded — the single worst outcome this product can produce. Uniqueness is guaranteed by the `(user_id, idempotency_key)` constraint proved in Phase 3 (invariant check 3).

---

## 7. Pagination

Cursor-based, always. The cursor is an opaque base64 encoding of `(occurredAt, seq)` — the exact tuple the Phase 3 index is built on.

Offset pagination is unusable here: the ledger appends continuously, so `?offset=25` silently skips or repeats rows that shifted between requests. On a financial timeline that is a correctness failure, not a cosmetic one.

```
GET /api/v1/transactions?limit=25
GET /api/v1/transactions?limit=25&cursor=eyJvIjoiMjAyNi0wNC0xNCIsInMiOjQyfQ
```

---

## 8. Endpoint catalogue

### 8.1 Ledger — `/api/v1/transactions`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/transactions` | Timeline; filters, search, cursor |
| `POST` | `/transactions` | **Record a receipt** — the primary mutation |
| `GET` | `/transactions/:id` | Event detail with derivation |
| `POST` | `/transactions/:id/reverse` | Append a reversal; reason mandatory |
| `POST` | `/transactions/bulk` | Month-end catch-up, one commit |
| `POST` | `/transactions/disburse` | Record a disbursement tranche |
| `POST` | `/transactions/penalty` | Charge a penalty |
| `POST` | `/transactions/adjustment` | Signed correction; reason mandatory |

There is deliberately **no** `PUT /transactions/:id` and **no** `DELETE`. The API cannot express an edit, mirroring the database triggers that would refuse one.

#### The record-payment contract

```http
POST /api/v1/transactions
Idempotency-Key: 01JQ8Z9ABCDEFGHJKMNPQRSTVW

{
  "loanId": "3f25…",
  "occurredOn": "2026-04-14",
  "interestMinor": "1000000",
  "principalMinor": "500000",
  "note": "UPI ref 4429"
}
```

`occurredOn` is separate from the server's record time throughout, because payments are routinely entered days after they land and all accrual arithmetic must use the former (Phase 3 §3).

Omitting `allocations` lets the engine settle oldest-first; supplying them overrides that per PRD E-11, and the schema rejects allocations exceeding the interest component.

**The response carries everything needed to reconcile:**

```json
{
  "data": {
    "events": [ {"type": "INTEREST_RECEIVED", …}, {"type": "PRINCIPAL_RECEIVED", …} ],
    "groupId": "…",
    "balance": { "outstandingPrincipalMinor": "…", "interestOutstandingMinor": "…", "nextDueOn": "2026-05-14" },
    "settledPeriods": [ { "id": "…", "status": "SETTLED" } ],
    "resolvedReminders": [ "…" ]
  },
  "meta": { … }
}
```

One round trip. The 3-tap, sub-10-second payment flow (PRD success criteria) cannot afford a follow-up fetch, and the offline queue needs the canonical result to reconcile its optimistic entry without going back to the network.

Note the two events: a split receipt is written as two typed rows sharing a `groupId`, because a single row cannot carry two tax categories (Phase 3 §3.3). The interface still presents one entry.

### 8.2 Borrowers, loans, and the rest

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` `POST` | `/borrowers` | Directory; create |
| `GET` `PATCH` | `/borrowers/:id` | Profile; edit |
| `POST` | `/borrowers/:id/archive` | Archive — never delete (PRD B-10) |
| `POST` | `/borrowers/:id/notes` | Append a note |
| `GET` | `/borrowers/:id/risk` | Score **with its factor breakdown** |
| `GET` `POST` | `/loans` | List; create |
| `GET` | `/loans/:id` | Detail |
| `GET` | `/loans/:id/schedule` | Accrual cycles, each with segments |
| `POST` | `/loans/:id/{amend,extend,close}` | Lifecycle commands |
| `GET` | `/dashboard` | All six tiers in one response |
| `GET` | `/analytics` | Charts for a range |
| `GET` `POST` | `/reminders` | List; create custom |
| `POST` | `/reminders/:id/{snooze,dismiss}` | Resolve |
| `GET` | `/notifications` · `POST /notifications/read` | Centre; mark read |
| `POST` | `/push/{subscribe,unsubscribe}` | Web Push registration |
| `POST` | `/documents/upload-url` → `POST /documents` | Signed upload, then confirm |
| `POST` | `/reports` · `GET /reports/:id` | Generate; poll |
| `GET` `PATCH` | `/settings` | Preferences |

**`/borrowers/:id/risk` returns the breakdown, not just the number.** PRD principle 8 forbids a black-box score attached to a real relationship, and an endpoint that returned a bare integer would make violating that the path of least resistance for every client.

### 8.3 Jobs — `/api/jobs/*`

`accrual` · `reminders` · `snapshots` · `risk` · `digest` · `prune`

Authenticated by `CRON_SECRET` compared in constant time — a cron endpoint is a public URL. Every invocation writes an `engine_run` row, and all six are idempotent, so a missed or duplicated run self-heals.

---

## 9. Two paths to the same data

Reads exist twice, and this is deliberate rather than duplication:

| Path | Used by | Mechanism |
| --- | --- | --- |
| RSC loader | Initial render | Calls `application/queries` directly — no HTTP hop |
| `GET /api/v1/*` | TanStack Query, pull-to-refresh, service worker | Same query functions behind a route handler |

Both call the identical function in `application/queries`. The route handler is a thin envelope around it. If the two ever disagreed the client would show one truth on load and another after refresh, so sharing the implementation is not an optimisation — it is the only correct arrangement.

---

## 10. Cross-cutting

| Concern | Contract |
| --- | --- |
| Auth | httpOnly session cookie; every request re-verified server-side (SEC-02) |
| Tenancy | Handlers resolve `userId` from the session and pass it to `withTenant`; it is never a parameter a client can supply |
| Versioning | `/v1` in the path; additive changes only within a version |
| Rate limits | `X-RateLimit-{Limit,Remaining,Reset}`; `429` with `Retry-After` |
| Compression | Brotli |
| Caching | Mutations `no-store`; reads `private, must-revalidate` with `ETag` |
| Tracing | `X-Request-Id` echoed on every response, matching `meta.requestId` |
| PII | Borrower names, phones, and amounts never appear in logs or error bodies (SEC-07) |

**`userId` is never a request parameter.** It comes from the verified session and nothing else. An endpoint that accepted it would make every tenancy control in Phases 3 and 4 bypassable by editing a JSON body.

---

## 11. Verification

```
✓ pnpm typecheck    clean under strict + 4 additional flags
✓ pnpm test         16/16 schema tests pass
✓ pnpm boundaries   no violations (39 modules, 26 dependencies)
```

The tests target the contract's sharp edges rather than its happy path: precision beyond 2⁵³, floats and JSON numbers rejected as amounts, a payment carrying no money, allocations exceeding their component, an end date before its start date, a reversal with no reason, a write-off with no reason.

---

## 12. Open questions

| # | Question | Needed by | Default |
| --- | --- | --- | --- |
| Q21 | Should `/dashboard` return all tiers, or one endpoint per tier for independent streaming? | Phase 9 | One response — RSC streams from a single loader; the client cache refetches whole |
| Q22 | Should report generation be synchronous for small portfolios and async above a threshold? | Phase 10 | Always async with polling; one code path is worth one extra round trip |
| Q23 | Does bulk payment need per-entry partial success, or all-or-nothing? | Phase 10 | All-or-nothing — a half-applied month-end reconciliation is worse than a retry |

---

## 13. Amendments to earlier phases

| Ref | Change | Rationale |
| --- | --- | --- |
| Phase 5 tree | `src/domain/schemas/` → `src/application/schemas/` | Verified violation of `domain-has-no-runtime-deps`. Validation of untrusted wire input is a use-case concern; `domain` keeps branded types and pure invariants. |

PRD ENG-03 is unchanged and satisfied: the schemas remain a single source of truth shared by client and server, one layer further out.

---

*End of Phase 6.*
