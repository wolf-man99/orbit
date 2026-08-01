# Orbit — Product Requirements Document

**What Moves, Grows**

| Field | Value |
| --- | --- |
| Product | Orbit |
| Category | Personal Capital Operating System |
| Document | Phase 1 — Product Requirements |
| Version | 1.0 |
| Status | Awaiting approval |
| Owner | Product |
| Supersedes | — |

---

## 1. Executive Summary

Orbit is a personal capital operating system for private lenders. It gives a single individual managing a private lending book the visibility, rigour, and auditability that an institution takes for granted — without the ceremony, the seat licences, or the ugliness of accounting software.

The product is not a loan tracker. A loan tracker records numbers. Orbit models capital: where it is deployed, what it is earning, what is at risk, what is arriving this month, and what deserves attention today. Every screen answers exactly one question, and the answer is legible in under three seconds.

**The wedge:** private lenders today run their books in notebooks, WhatsApp threads, and improvised spreadsheets. They know their borrowers intimately but their portfolio only approximately. They can tell you what Rajesh owes. They cannot tell you their blended yield, their collection rate, their concentration risk, or what happens to cash flow if the two largest borrowers go quiet. Orbit closes that gap.

---

## 2. Problem Statement

### 2.1 Current state

A private lender with ₹50L–₹10Cr deployed across 5–60 borrowers typically operates like this:

- Principal, rate, and start date live in a physical ledger or a spreadsheet tab.
- Payments arrive irregularly via UPI or cash and are confirmed over WhatsApp.
- Interest is computed mentally, per borrower, per month.
- "Who has not paid this month" is reconstructed from memory at month end.
- Loan agreements and cheques are photographs scattered across a camera roll.
- Portfolio-level truth — yield, exposure, recovery rate — does not exist in any form.

### 2.2 Consequences

| Problem | Cost |
| --- | --- |
| Interest computed manually | Silent revenue leakage; months quietly missed |
| No accrual record | Cannot distinguish "not yet due" from "overdue" |
| Memory-based follow-up | Late collections, awkward conversations, strained relationships |
| No portfolio view | Capital sits idle or over-concentrates without the lender noticing |
| No audit trail | Disputes become one person's word against another's |
| No forecast | Cannot plan personal liquidity around incoming collections |
| Records tied to a device or a book | Loss, theft, or damage destroys the record permanently |

### 2.3 Why now

Every input this product needs is already digital — UPI confirmations, WhatsApp receipts, phone-camera agreements. The lender's data is stranded across apps that were never designed to hold it. The missing layer is a system of record that is pleasant enough to actually use in the thirty seconds after a payment lands.

### 2.4 Why this is hard

Consumer lending software assumes fixed EMIs, fixed tenures, and institutional collection. Private lending has none of these:

- Tenure is frequently **open-ended** — "until he returns the principal."
- Payments are **irregular** — two months paid at once, then a gap, then a partial.
- Principal returns in **unpredictable chunks**, changing the interest base mid-period.
- Rates are quoted **per month**, not per annum, and often as "₹2 per hundred."
- Enforcement is **relational**, not legal — the software must never damage the relationship.

Any model built on amortization schedules breaks on contact with this reality. Orbit is built on an accrual ledger instead.

---

## 3. Vision & Positioning

### 3.1 Vision

> A private lender should be able to open one screen and know, with total confidence, the state of their capital — and close it thirty seconds later having recorded what changed.

### 3.2 Positioning

Orbit sits deliberately between two worlds:

| | Accounting software | **Orbit** | Notes app |
| --- | --- | --- | --- |
| Rigour | High | **High** | None |
| Effort to use | High | **Very low** | Very low |
| Portfolio intelligence | Low | **High** | None |
| Feels good to open | No | **Yes** | Neutral |

Orbit is what a private banking platform would be if it were built for one person, by Apple.

### 3.3 Product principles

1. **Every screen answers one question.** If a screen answers two, it is two screens.
2. **The ledger is sacred.** Financial history is append-only. Nothing is ever silently edited or deleted.
3. **Never guess with money.** If a figure is estimated, projected, or accrued-but-unpaid, it is labelled as such.
4. **Calm over dense.** Whitespace is a feature. A number that matters gets a whole line.
5. **Two taps to anything.** Three is the ceiling, and the third is rare.
6. **The relationship is the asset.** Tone is never punitive. Borrowers are people, not delinquent accounts.
7. **Fast beats featureful.** A missing feature is an inconvenience. A slow app is abandoned.
8. **Explain every score.** No black-box risk numbers. Every derived metric shows its inputs.

### 3.4 Anti-goals

Orbit will **not**:

- Chase borrowers automatically, or send anything to a borrower without explicit human action.
- Score borrowers against external credit bureaus or share data with third parties.
- Use aggressive fintech visual language — no confetti economies, no gamified streaks, no gradients for their own sake.
- Present projections as certainties.
- Become a general-purpose accounting ledger or a personal finance aggregator.
- Facilitate, encourage, or optimise for predatory lending terms.

---

## 4. Users

### 4.1 Primary persona — "The Principal"

| Attribute | Detail |
| --- | --- |
| Who | Individual private lender, 35–65 |
| Book size | ₹50L – ₹10Cr deployed |
| Borrowers | 5 – 60 active relationships |
| Device | Mobile-first (iOS/Android), occasional desktop for review |
| Current tools | Notebook, Excel, WhatsApp, UPI app |
| Financial literacy | High intuition, low formal accounting vocabulary |
| Sessions | 30–60s, several times weekly; 10–20min at month end |
| Motivation | Confidence, dignity, control. Not spreadsheets. |
| Fear | Forgetting something. Being seen as disorganised. Losing the record. |

**Jobs to be done**

- *When money lands in my account, I want to record it in seconds, so my book is never stale.*
- *When it is the 1st, I want to know exactly who owes me interest, so I can follow up gracefully.*
- *When someone asks for a fresh loan, I want to see our full history instantly, so I can decide well.*
- *When I plan a large personal expense, I want to know what is arriving, so I do not over-commit.*
- *When there is a disagreement, I want an unimpeachable record, so the relationship survives it.*

### 4.2 Secondary persona (post-V1) — "The Associate"

A spouse, adult child, or accountant granted scoped access. Drives the role-based access requirements in Section 12 but is **out of scope for V1**.

### 4.3 Tertiary persona (post-V1) — "The Auditor"

A chartered accountant needing year-end interest income summaries. Drives the export and tax-report requirements. Only the export surface is in V1 scope.

---

## 5. Scope

### 5.1 V1 — in scope

| Area | Included |
| --- | --- |
| Auth | Email/OTP sign-in, session persistence, biometric app lock |
| Borrowers | Full CRUD, photo, contact, tags, risk score, relationship history |
| Loans | Multiple loans per borrower, flat and reducing-balance simple interest |
| Ledger | Append-only event log, immutable financial entries, reversals, adjustments |
| Transactions | Record disbursement, interest, principal, penalty; search, filter, export |
| Dashboard | 15 portfolio signals, today's tasks, cash-flow forecast, quick actions |
| Analytics | 10 chart surfaces across performance, exposure, and recovery |
| Reminders | Automatic monthly generation, overdue detection, custom reminders, push |
| Documents | Upload, preview, attach to borrower or loan |
| Reports | CSV, Excel, PDF — portfolio, borrower, and cash-flow reports |
| Settings | Theme, currency, interest convention, security, backup, import/export |
| Platform | Responsive web, installable PWA, offline capture, web push |

### 5.2 V1 — explicitly out of scope

Deferred with architectural accommodation (see Section 12): multi-user and teams, role-based access, multiple portfolios, multi-currency books, compound and penalty-accrual interest, bank/UPI integration, OCR, AI insights and risk detection, tax report generation, borrower-facing portal, and any automated outbound communication.

### 5.3 Success criteria

| Metric | Target | Measurement |
| --- | --- | --- |
| Time to record a received payment | < 10s from cold app open | Instrumented timing |
| Taps to record a payment | ≤ 3 | Interaction audit |
| Dashboard answers "am I healthy?" | < 3s comprehension | Usability testing |
| Month-end reconciliation time | < 10 min for 40 borrowers | User-reported |
| Perceived ledger accuracy | 100% — zero unexplained figures | Support signal |
| Weekly active use | ≥ 4 sessions/week | Analytics |
| Data loss incidents | Zero | Incident log |

---

## 6. Domain Model (Conceptual)

> Detailed schema is Phase 3. This section fixes the *concepts and invariants* that the schema must satisfy.

### 6.1 Entities

| Entity | Definition |
| --- | --- |
| **User** | The account holder. Owns everything. Future: belongs to an Organisation. |
| **Portfolio** | A book of capital. V1 has exactly one, created implicitly. Present from day one so multi-portfolio is additive, not a migration. |
| **Borrower** | A person or business the capital is lent to. Holds identity, contact, relationship metadata, and derived risk. |
| **Loan** | A single deployment of capital to a Borrower under specific terms. A Borrower may hold many, concurrently or historically. |
| **LedgerEvent** | An immutable record of something that happened to a Loan. The single source of financial truth. |
| **AccrualPeriod** | A computed, dated slice of interest owed on a Loan. Generated by the engine, not entered by the user. |
| **Reminder** | A dated intention to act, generated by the engine or created by the user. |
| **Document** | A file attached to a Borrower or a Loan. |
| **Notification** | A delivered or pending message to the User. |
| **AnalyticsSnapshot** | A periodic materialised roll-up of portfolio state, for fast history and trend charts. |
| **Settings** | User and portfolio preferences, including financial conventions. |

### 6.2 Relationships

```
User ──1:N──> Portfolio ──1:N──> Borrower ──1:N──> Loan ──1:N──> LedgerEvent
                                      │                 │
                                      │                 ├──1:N──> AccrualPeriod
                                      │                 └──1:N──> Document
                                      ├──1:N──> Document
                                      └──1:N──> Reminder  <──N:1── Loan
Portfolio ──1:N──> AnalyticsSnapshot
User ──1:N──> Notification
User ──1:1──> Settings
```

### 6.3 The dual-ledger model

This is the central architectural commitment of the product.

Two independent streams describe every loan:

| Stream | Source | Answers |
| --- | --- | --- |
| **Accrual ledger** | Computed by the interest engine | "What *should* have been earned by now?" |
| **Cash ledger** | Recorded by the user as LedgerEvents | "What *actually* moved?" |

Every meaningful metric in the product is a relationship between the two:

```
Interest Outstanding  = Σ accrued interest − Σ interest received
Collection Rate       = Σ interest received ÷ Σ interest due   (over a window)
Overdue               = accrual period past its grace window with no matching receipt
Portfolio Yield       = Σ interest received ÷ average deployed principal (annualised)
Cash Flow Forecast    = projected future accruals + scheduled principal returns
```

**Why this matters:** a single-ledger design ("outstanding = principal + interest − payments") cannot distinguish *not yet due* from *overdue*, cannot compute a collection rate, and produces a number that silently drifts as time passes without any event. The dual ledger makes time itself a first-class input, which is exactly what open-ended lending requires.

### 6.4 Immutability and correction

**Invariant: a LedgerEvent, once written, is never updated or deleted.**

| Situation | Mechanism |
| --- | --- |
| Wrong amount entered | Write a `REVERSAL` referencing the original, then write the correct event |
| Small reconciliation difference | Write an `ADJUSTMENT` with a mandatory reason |
| Wrong loan selected | `REVERSAL` on the wrong loan, new event on the correct loan |
| Typo in a note | Notes are non-financial; a new note supersedes, both remain visible |

Every event carries: `id`, `loanId`, `type`, `occurredAt` (when it happened in the world), `recordedAt` (when it entered Orbit), `amountMinor`, `currency`, `createdBy`, `idempotencyKey`, `reversesEventId`, `reversedByEventId`, `note`, `metadata`.

The separation of `occurredAt` and `recordedAt` is required: payments are frequently recorded days after they land, and every accrual computation must use `occurredAt` while every audit view must be able to show `recordedAt`.

### 6.5 Event taxonomy

| Event | Financial | Effect |
| --- | --- | --- |
| `LOAN_DISBURSED` | Yes | Increases outstanding principal; starts accrual |
| `INTEREST_RECEIVED` | Yes | Reduces outstanding interest |
| `PRINCIPAL_RECEIVED` | Yes | Reduces outstanding principal; changes future accrual base (reducing-balance loans) |
| `PENALTY_CHARGED` | Yes | Increases amount owed |
| `PENALTY_WAIVED` | Yes | Reduces amount owed; requires reason |
| `ADJUSTMENT` | Yes | Signed correction; requires reason |
| `REVERSAL` | Yes | Negates a specific prior event |
| `LOAN_CLOSED` | Yes | Terminates accrual; requires zero outstanding or an explicit write-off |
| `LOAN_EXTENDED` | No | Moves expected end date; accrual continues |
| `LOAN_TERMS_AMENDED` | No | Rate or convention change, effective from a date; prior accruals unaffected |
| `NOTE_ADDED` | No | Timeline entry |
| `DOCUMENT_UPLOADED` | No | Timeline entry |
| `REMINDER_SENT` | No | Timeline entry |

Financial events post to the ledger. Non-financial events appear on the same timeline but never alter balances. Both are immutable.

### 6.6 Money and precision

| Rule | Requirement |
| --- | --- |
| **M-01** | All monetary values stored as **integer minor units** (paise). Floating point is prohibited in storage, transport, and arithmetic. |
| **M-02** | Every stored amount carries an explicit ISO-4217 currency code. |
| **M-03** | Interest rates stored as **basis points per period** with an explicit period (`MONTHLY` \| `ANNUAL`), never as a float percentage. |
| **M-04** | Accrual computed at full integer precision; rounded to the minor unit only at period close, using half-up. |
| **M-05** | Rounding residue is carried forward into the next period so cumulative totals never drift. |
| **M-06** | Display formatting uses `Intl.NumberFormat` with the portfolio currency and locale; the Indian grouping convention (`₹12,34,567`) must render correctly. |
| **M-07** | All financial figures render with **tabular numerals** so digits align across rows. |

---

## 7. The Interest Engine

The engine is the product's core intellectual property. It converts loan terms plus elapsed time into accrual periods.

### 7.1 Conventions (V1)

| Convention | Basis | Typical use |
| --- | --- | --- |
| `FLAT_MONTHLY` | Original principal, fixed monthly amount | "₹2 per hundred per month" — the most common private arrangement |
| `REDUCING_SIMPLE` | Current outstanding principal, recomputed each period | Loans where principal returns in instalments |

Both are implemented behind a single `InterestStrategy` interface so `COMPOUND`, `PENALTY_ACCRUAL`, and `AMORTIZED_EMI` are additive in later phases (Section 12).

### 7.2 Requirements

| ID | Requirement |
| --- | --- |
| **E-01** | Given loan terms and a date range, the engine produces a deterministic, ordered list of `AccrualPeriod` records. |
| **E-02** | Accrual is **pure and reproducible** — same inputs always yield identical output, with no dependence on wall-clock time at call site. |
| **E-03** | Periods align to the loan's anchor day (its start date's day-of-month), not the calendar month, unless the user overrides this in Settings. |
| **E-04** | Month-end anchors clamp correctly: a loan started on the 31st accrues on the 28th/29th/30th in shorter months. |
| **E-05** | Partial first and final periods are pro-rated using the configured day-count convention. |
| **E-06** | Day-count conventions supported: `ACTUAL_365`, `ACTUAL_ACTUAL`, `THIRTY_360`. Default `ACTUAL_365`. |
| **E-07** | A `PRINCIPAL_RECEIVED` event mid-period splits that period on `REDUCING_SIMPLE` loans, accruing each segment on its correct base. |
| **E-08** | Accrual stops at `LOAN_CLOSED.occurredAt`. No accrual is generated beyond it. |
| **E-09** | `LOAN_TERMS_AMENDED` applies from its effective date forward only; historical periods are never retroactively recomputed. |
| **E-10** | A period is `DUE` after its end date, `OVERDUE` after its end date plus the configured grace window (default 5 days), `SETTLED` when matched receipts cover it. |
| **E-11** | Receipts allocate to accrual periods **oldest-first** by default; the user may override allocation on a specific receipt. |
| **E-12** | Every displayed accrual figure can expose its full derivation: base, rate, day count, period bounds, and result. |
| **E-13** | The engine is a standalone, dependency-free module, unit-tested to ≥ 95% branch coverage, usable identically on server and client. |
| **E-14** | Engine version is stamped on every generated period so historical figures remain explainable after the engine evolves. |

### 7.3 Worked example

Loan: ₹5,00,000 at 2% per month, `REDUCING_SIMPLE`, `ACTUAL_365`, started 15 March.

| Period | Base | Days | Accrued | Note |
| --- | --- | --- | --- | --- |
| 15 Mar – 14 Apr | ₹5,00,000 | 31 | ₹10,000 | Full period |
| 15 Apr – 30 Apr | ₹5,00,000 | 16 | ₹5,161 | Split — principal received 30 Apr |
| 01 May – 14 May | ₹4,00,000 | 14 | ₹3,613 | New base after ₹1,00,000 returned |

Split-period arithmetic of this kind is exactly what manual tracking gets wrong, and it is why the engine — not the user — owns this calculation.

---

## 8. Feature Requirements

Requirements are labelled `MUST` (V1 blocking), `SHOULD` (V1 target, descopable), `LATER` (post-V1).

### 8.1 Dashboard

> **Question this screen answers: "Is my capital healthy today?"**

| ID | Requirement | Priority |
| --- | --- | --- |
| D-01 | Hero: **Portfolio Value** (outstanding principal + accrued unpaid interest), count-up animated, tabular | MUST |
| D-02 | Outstanding Principal — total capital currently deployed | MUST |
| D-03 | Total Interest Earned — lifetime received, plus accrued-unpaid shown distinctly | MUST |
| D-04 | Interest Due This Month — accruals falling due in the current cycle | MUST |
| D-05 | Collections Due — sum of unsettled accruals, split *due* vs *overdue* | MUST |
| D-06 | Overdue Loans — count and value, tap-through to a filtered list | MUST |
| D-07 | Average Interest Rate — principal-weighted, not arithmetic mean | MUST |
| D-08 | Average Loan Size across active loans | MUST |
| D-09 | Collection Rate — trailing 6 months, received ÷ due, with sparkline | MUST |
| D-10 | Portfolio Health — 0–100 composite with band label and factor breakdown on tap | MUST |
| D-11 | Today's Tasks — reminders due today, dismissible, resolvable inline | MUST |
| D-12 | Upcoming Collections — next 30 days, grouped by date | MUST |
| D-13 | Recent Activity — last 10 ledger events with borrower avatars | MUST |
| D-14 | Cash Flow Forecast — 6-month projection: accruals + expected principal returns | MUST |
| D-15 | Quick Actions — Record Payment, Add Loan, Add Borrower, New Reminder | MUST |
| D-16 | Every metric card states its as-of time; no figure is undated | MUST |
| D-17 | Pull-to-refresh recomputes and re-syncs | MUST |
| D-18 | Empty state guides a first-time user to add their first borrower | MUST |
| D-19 | Skeleton loading for every card; no spinners | MUST |
| D-20 | Metric card order is user-reorderable and persisted | LATER |

**Portfolio Health composite (D-10)** — deterministic and fully explainable:

| Factor | Weight | Signal |
| --- | --- | --- |
| Collection rate (trailing 6m) | 35% | Interest received ÷ interest due |
| Overdue exposure | 25% | Value overdue ÷ total outstanding |
| Concentration risk | 20% | Herfindahl index across borrower exposure |
| Payment punctuality | 15% | Mean days between due and settled |
| Portfolio age & stability | 5% | Weighted tenure of active loans |

### 8.2 Borrowers

> **Question this screen answers: "Who owes me what, and who needs attention?"**

| ID | Requirement | Priority |
| --- | --- | --- |
| B-01 | Card grid/list: photo or generated monogram, name, status, outstanding, rate, next due date | MUST |
| B-02 | Instant client-side search across name, phone, and tag | MUST |
| B-03 | Filters: status (active/closed/overdue), rate band, amount band, tag | MUST |
| B-04 | Sort: outstanding, next due date, risk score, name, relationship age | MUST |
| B-05 | Status derives from loans, never manually set: `Active`, `Overdue`, `Due Soon`, `Closed`, `Dormant` | MUST |
| B-06 | Mobile swipe actions: Call, WhatsApp, Mark Paid, Remind | MUST |
| B-07 | Desktop equivalents via row hover actions and keyboard shortcuts | MUST |
| B-08 | WhatsApp opens a prefilled, **user-editable** draft — Orbit never sends autonomously | MUST |
| B-09 | Create/edit borrower: name, phone, photo, address, ID reference, relationship tag, notes | MUST |
| B-10 | A borrower with any ledger history can be archived but never hard-deleted | MUST |
| B-11 | Virtualised list; smooth at 500+ borrowers | SHOULD |
| B-12 | Import borrowers from device contacts | LATER |

### 8.3 Borrower Profile

> **Question this screen answers: "What is my complete history with this person?"**

| ID | Requirement | Priority |
| --- | --- | --- |
| BP-01 | Hero: photo, name, relationship tag, total outstanding, risk score | MUST |
| BP-02 | Summary cards: principal out, interest earned, interest outstanding, loans (active/total), avg rate, relationship since | MUST |
| BP-03 | Loan timeline — every loan as a horizontal band showing tenure, status, and repayment progress | MUST |
| BP-04 | Payment timeline — chronological ledger of all events across all their loans | MUST |
| BP-05 | Risk score 0–100 with a factor breakdown; no unexplained number | MUST |
| BP-06 | Notes — append-only, timestamped | MUST |
| BP-07 | Documents — grid with preview, download, and loan association | MUST |
| BP-08 | Quick actions: Record Payment, New Loan, Remind, Call, WhatsApp | MUST |
| BP-09 | Per-borrower analytics: payment punctuality history, interest contribution to portfolio | MUST |
| BP-10 | Relationship tags: Family, Friend, Business, Referral, Community (configurable) | MUST |
| BP-11 | Exposure warning when a single borrower exceeds a configurable share of the portfolio | SHOULD |

**Borrower risk score (BP-05)** — deterministic, explainable, never shared externally:

| Factor | Weight | Signal |
| --- | --- | --- |
| Payment punctuality | 30% | Mean days late across settled periods |
| Missed period ratio | 25% | Unsettled periods ÷ total periods elapsed |
| Exposure concentration | 20% | Their outstanding ÷ portfolio outstanding |
| Relationship tenure | 15% | Longer clean history lowers risk |
| Partial payment frequency | 10% | Rate of under-payment against due amounts |

Bands: 0–24 Strong, 25–49 Steady, 50–74 Watch, 75–100 Strained. Language is deliberately non-punitive.

### 8.4 Loans

| ID | Requirement | Priority |
| --- | --- | --- |
| L-01 | Fields: principal, rate + rate period, interest convention, day count, start date, expected end date (nullable), grace days, purpose, collateral note | MUST |
| L-02 | Expected end date is optional — open-ended tenure is a first-class case | MUST |
| L-03 | Derived and always visible: outstanding principal, accrued interest, interest outstanding, monthly interest, total received, next due date | MUST |
| L-04 | Status derived from ledger and time: `Active`, `Due`, `Overdue`, `Closed`, `Written Off` | MUST |
| L-05 | Full event history on the loan, newest first, with reversals visually struck and linked | MUST |
| L-06 | Multiple concurrent loans per borrower, each with independent terms | MUST |
| L-07 | Amend terms with an effective date; historical accruals never recomputed | MUST |
| L-08 | Extend loan — moves expected end date, logs `LOAN_EXTENDED` | MUST |
| L-09 | Close loan — blocked unless outstanding is zero or the user explicitly writes off the remainder with a reason | MUST |
| L-10 | Loan closure plays a restrained success animation | SHOULD |
| L-11 | Interest projection preview at creation: monthly interest and total interest over expected tenure | SHOULD |

### 8.5 Transactions

> **Question this screen answers: "What has moved?"**

| ID | Requirement | Priority |
| --- | --- | --- |
| T-01 | Unified chronological timeline across the entire portfolio, grouped by day | MUST |
| T-02 | Each row: type glyph, borrower, amount (signed, coloured by direction), loan reference, relative time | MUST |
| T-03 | Filters: type, borrower, loan, date range, amount range, direction | MUST |
| T-04 | Full-text search across notes, borrower names, and amounts | MUST |
| T-05 | Record payment flow in ≤ 3 taps from anywhere via the FAB | MUST |
| T-06 | Record flow auto-suggests the due amount and the oldest unsettled period | MUST |
| T-07 | A single receipt may split across interest and principal in one entry | MUST |
| T-08 | Reversal and adjustment flows, each requiring a mandatory reason | MUST |
| T-09 | Export the current filtered view to CSV and Excel | MUST |
| T-10 | Infinite scroll with cursor pagination; smooth at 10,000+ events | MUST |
| T-11 | Payment success animation — brief, tasteful, with haptic feedback on supported devices | MUST |
| T-12 | Optimistic insert with rollback and clear error surfacing on failure | MUST |
| T-13 | Bulk entry for month-end catch-up across several borrowers | SHOULD |

### 8.6 Analytics

> **Question this screen answers: "How is my capital performing over time?"**

| ID | Chart | Type | Priority |
| --- | --- | --- | --- |
| A-01 | Monthly Interest — accrued vs received | Grouped bar | MUST |
| A-02 | Portfolio Growth — total value over time | Area | MUST |
| A-03 | Outstanding Capital — deployed principal over time | Line | MUST |
| A-04 | Cash Flow — inflow vs outflow by month | Diverging bar | MUST |
| A-05 | Collection Rate — trailing rate over time with target band | Line | MUST |
| A-06 | Interest Distribution — share of interest income by borrower | Donut | MUST |
| A-07 | Top Borrowers — by outstanding and by interest contributed | Ranked bar | MUST |
| A-08 | Late Payments — count and value of overdue periods over time | Bar | MUST |
| A-09 | Recovery Trends — days-to-settle distribution over time | Line | MUST |
| A-10 | Forecast — 6/12-month projected interest and principal returns | Area with confidence band | MUST |
| A-11 | Global range selector: 3M / 6M / 1Y / All, persisted | MUST |
| A-12 | Charts animate in on mount, respect `prefers-reduced-motion`, and are keyboard-navigable | MUST |
| A-13 | Every chart has an accessible data-table equivalent | MUST |
| A-14 | Projections visually distinguished from actuals (dashed/lower opacity) and labelled | MUST |
| A-15 | Analytics computed from `AnalyticsSnapshot` roll-ups, not full ledger scans, above a threshold volume | MUST |
| A-16 | Export any chart as PNG | SHOULD |

### 8.7 Reminders & Notifications

> **Question this screen answers: "What needs me?"**

| ID | Requirement | Priority |
| --- | --- | --- |
| R-01 | Auto-generate an interest-due reminder per active loan per accrual period | MUST |
| R-02 | Auto-generate an overdue reminder when a period passes its grace window | MUST |
| R-03 | Auto-generate a loan-closure reminder ahead of expected end date (configurable lead) | MUST |
| R-04 | Custom reminders with free text, date, and optional borrower/loan link | MUST |
| R-05 | Reminders resolve automatically when a matching payment is recorded | MUST |
| R-06 | Snooze, dismiss, and mark-done, each logged | MUST |
| R-07 | Web push via VAPID; graceful degradation to in-app when unsupported or unpermitted | MUST |
| R-08 | Quiet hours and per-type notification preferences | MUST |
| R-09 | Generation is **idempotent** — safe to re-run without duplicating reminders | MUST |
| R-10 | Notification centre with unread state, grouping, and mark-all-read | MUST |
| R-11 | Permission requested contextually after demonstrated value, never on first load | MUST |
| R-12 | Daily digest option instead of per-event pushes | SHOULD |

### 8.8 Documents

| ID | Requirement | Priority |
| --- | --- | --- |
| DOC-01 | Upload images and PDFs, attach to borrower or loan | MUST |
| DOC-02 | Client-side image compression before upload | MUST |
| DOC-03 | In-app preview for images and PDFs | MUST |
| DOC-04 | Private storage; time-limited signed URLs only | MUST |
| DOC-05 | Types: Agreement, Cheque, ID Proof, Receipt, Other | MUST |
| DOC-06 | Upload progress with resumability on flaky connections | SHOULD |
| DOC-07 | OCR extraction of agreement terms | LATER |

### 8.9 Reports

| ID | Requirement | Priority |
| --- | --- | --- |
| RP-01 | Monthly Portfolio Report — PDF, branded, print-quality | MUST |
| RP-02 | Borrower Report — full statement of account for one borrower, PDF | MUST |
| RP-03 | Cash Flow Report — inflow/outflow by period, PDF and Excel | MUST |
| RP-04 | Raw data export — CSV and Excel, all entities, respecting active filters | MUST |
| RP-05 | Reports generated server-side for deterministic output | MUST |
| RP-06 | Every report footer carries generation timestamp and engine version | MUST |
| RP-07 | Scheduled monthly report email | LATER |
| RP-08 | Financial-year tax summary | LATER |

### 8.10 Settings

> **Question this screen answers: "How does Orbit behave?"**

| ID | Requirement | Priority |
| --- | --- | --- |
| S-01 | Theme: Dark (default), Light, System | MUST |
| S-02 | Currency selection with correct locale grouping and symbol | MUST |
| S-03 | Interest defaults: convention, day count, rate period, grace days, accrual anchor | MUST |
| S-04 | Security: biometric/passcode app lock, auto-lock timeout, active session list | MUST |
| S-05 | Full data export (JSON) — complete, re-importable, user-owned | MUST |
| S-06 | Import from JSON export and from CSV, with a validation preview before commit | MUST |
| S-07 | Backup status with last-synced timestamp | MUST |
| S-08 | Notification preferences and quiet hours | MUST |
| S-09 | Profile, portfolio name, and display preferences | MUST |
| S-10 | Account deletion with explicit confirmation and full data removal | MUST |
| S-11 | Reduced-motion and increased-contrast toggles overriding OS defaults | SHOULD |

---

## 9. Experience Requirements

### 9.1 Navigation

| ID | Requirement |
| --- | --- |
| UX-01 | Mobile: 5-item bottom navigation — Dashboard, Borrowers, Transactions, Analytics, Settings |
| UX-02 | Desktop: collapsible left sidebar with the same information architecture |
| UX-03 | Persistent FAB for the primary action, context-aware by route |
| UX-04 | Bottom sheets on mobile, centred modals on desktop, from one shared component |
| UX-05 | Any destination reachable in ≤ 3 taps from any screen |
| UX-06 | Command palette (`⌘K`) with fuzzy search across borrowers, loans, and actions |
| UX-07 | Keyboard shortcuts for all primary actions, with a discoverable `?` cheatsheet |
| UX-08 | Back navigation preserves scroll position and filter state |
| UX-09 | Deep-linkable, shareable URLs for every entity view |

### 9.2 Motion and feedback

| ID | Requirement |
| --- | --- |
| UX-10 | Transitions 150–200ms, ease-out. Nothing bounces. Nothing overshoots. |
| UX-11 | Hero numbers count up on first paint only, never on re-render |
| UX-12 | Skeletons match final layout dimensions to eliminate layout shift |
| UX-13 | Spinners permitted only for indeterminate operations exceeding 400ms |
| UX-14 | Haptic feedback on payment success, loan closure, and swipe-action commit |
| UX-15 | Every animation respects `prefers-reduced-motion` |
| UX-16 | Pull-to-refresh on all list and dashboard surfaces |
| UX-17 | Cards expand in place rather than navigating, where content permits |

### 9.3 States

Every data surface must define all five: **loading** (skeleton), **empty** (guidance + primary action), **error** (cause + retry), **partial/offline** (stale banner + last-synced time), **success**.

### 9.4 Accessibility

| ID | Requirement |
| --- | --- |
| ACC-01 | WCAG 2.2 AA across both themes |
| ACC-02 | Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and interactive boundaries |
| ACC-03 | Full keyboard operability; visible focus rings; no keyboard traps |
| ACC-04 | Correct semantics and ARIA; charts exposed as accessible tables |
| ACC-05 | Touch targets ≥ 44×44pt |
| ACC-06 | Status never conveyed by colour alone — always paired with a glyph or label |
| ACC-07 | Dynamic type support up to 200% without loss of function |
| ACC-08 | Screen-reader announcements for optimistic updates and their outcomes |

---

## 10. Non-Functional Requirements

### 10.1 Performance

| ID | Requirement | Target |
| --- | --- | --- |
| P-01 | Largest Contentful Paint (mobile, 4G) | < 1.8s |
| P-02 | Interaction to Next Paint | < 200ms |
| P-03 | Cumulative Layout Shift | < 0.05 |
| P-04 | Time to Interactive on repeat visit | < 1.0s |
| P-05 | Initial JS bundle (gzipped) | < 180KB |
| P-06 | Dashboard API response (p95) | < 300ms |
| P-07 | Transaction list scroll | 60fps at 10,000 events |
| P-08 | Route-level code splitting; charts and reports lazy-loaded | Required |

### 10.2 Reliability and data integrity

| ID | Requirement |
| --- | --- |
| REL-01 | Ledger writes are transactional and atomic |
| REL-02 | Every mutation carries a client-generated idempotency key; retries never double-post |
| REL-03 | Optimistic updates roll back cleanly and visibly on failure |
| REL-04 | Error boundaries at route and widget level — one broken chart never blanks the app |
| REL-05 | Derived values are always recomputable from the event log; no derived value is the sole source of truth |
| REL-06 | Nightly automated backup with tested restore |
| REL-07 | Structured error and performance monitoring in production |

### 10.3 Offline and PWA

| ID | Requirement |
| --- | --- |
| PWA-01 | Installable with full manifest, maskable icons, splash screens |
| PWA-02 | App shell and last-known portfolio state cached for offline read |
| PWA-03 | Payments recordable offline, queued locally, synced on reconnect |
| PWA-04 | Because the ledger is append-only, sync has **no merge conflicts** — only ordering by `occurredAt` and idempotent de-duplication |
| PWA-05 | Clear, non-alarming offline indicator with pending-write count |
| PWA-06 | Web push via service worker with VAPID (installed PWA required on iOS 16.4+) |
| PWA-07 | Background sync where supported, with a foreground fallback |

### 10.4 Security and privacy

| ID | Requirement |
| --- | --- |
| SEC-01 | Row-level security enforced at the database — every row scoped to its owner |
| SEC-02 | Authorisation enforced server-side on every request; client checks are UX only |
| SEC-03 | TLS in transit; encryption at rest for database and document storage |
| SEC-04 | Documents served only via short-lived signed URLs |
| SEC-05 | Biometric/passcode app lock with configurable auto-lock |
| SEC-06 | Input validated with a shared schema on both client and server; server is authoritative |
| SEC-07 | No borrower PII in logs, analytics, or error reports |
| SEC-08 | Rate limiting on auth and mutation endpoints |
| SEC-09 | Full data export and hard account deletion available to the user at all times |
| SEC-10 | Strict CSP, secure headers, no inline script |

### 10.5 Engineering quality

| ID | Requirement |
| --- | --- |
| ENG-01 | TypeScript strict mode; `any` prohibited outside justified, commented boundaries |
| ENG-02 | Feature-based folder architecture; no cross-feature imports except through public module entrypoints |
| ENG-03 | Shared Zod schemas as the single source of truth for validation and inferred types |
| ENG-04 | Interest engine ≥ 95% branch coverage; overall ≥ 80% |
| ENG-05 | E2E coverage of the critical paths: add borrower → create loan → record payment → close loan |
| ENG-06 | Every design value comes from a token; no hard-coded colours or spacing in components |
| ENG-07 | CI gates on typecheck, lint, unit, E2E, and bundle-size budget |
| ENG-08 | Every database migration is reversible and reviewed |

---

## 11. Design Requirements

Full system is Phase 7. Binding constraints:

| Token | Value |
| --- | --- |
| Background | `#09090B` |
| Surface | `#18181B` |
| Elevated surface | `#27272A` |
| Text primary | `#FAFAFA` |
| Text secondary | `#A1A1AA` |
| Accent (positive/primary) | `#10B981` |
| Blue (informational) | `#2563EB` |
| Warning | `#F59E0B` |
| Danger | `#EF4444` |
| Border | `#2A2A2A` |
| Radius — cards, charts | `20px` |
| Radius — buttons, inputs | `16px` |
| Spacing | 8-point scale |
| Typeface | SF Pro Display → Inter fallback |
| Numerals | Tabular, always, for money |
| Icons | Lucide |
| Motion | Framer Motion, 150–200ms, ease-out |

| ID | Requirement |
| --- | --- |
| DS-01 | Dark theme is the design origin; light theme is a first-class derived output, not an inversion |
| DS-02 | All colour, spacing, radius, elevation, and motion values exposed as CSS custom properties |
| DS-03 | Semantic token layer (`--surface-elevated`) sits above the primitive layer (`--zinc-800`); components consume semantic tokens only |
| DS-04 | Gradients reserved exclusively for chart fills |
| DS-05 | Accent colour reserved for positive financial movement and primary actions — never decoration |
| DS-06 | Maximum one primary action per screen |
| DS-07 | Typographic scale caps at five sizes; hierarchy comes from weight and space, not size proliferation |
| DS-08 | Every component ships light and dark variants and full keyboard states |

---

## 12. Future Scalability

Architectural accommodations required in V1 so these are additive later, never a rewrite:

| Future capability | V1 accommodation |
| --- | --- |
| Multiple users | `userId` on every entity from day one; RLS from day one |
| Teams & organisations | `Portfolio` entity exists in V1 with a single implicit instance |
| Role-based access | Authorisation routed through a single policy layer, even though V1 has one role |
| Multiple portfolios | `portfolioId` foreign key present and enforced on all entities |
| Multiple currencies | Currency code stored per amount; all display via `Intl` from day one |
| Compound / penalty / EMI interest | `InterestStrategy` interface with the convention stored per loan |
| Bank & UPI integration | Ledger events carry a nullable `externalRef` and `source` (`MANUAL` \| `IMPORTED` \| `INTEGRATION`) |
| OCR for agreements | Documents carry a nullable `extractedData` JSON field |
| AI insights & risk detection | Risk scoring lives behind a `RiskModel` interface with the deterministic V1 model as the first implementation |
| Tax reports | Ledger events carry a `taxCategory` classification from day one |
| Borrower portal | Borrower entity holds a nullable `linkedUserId` |

**Principle:** V1 does not build these. V1 makes certain that building them later never requires a data migration or a rewrite of the ledger.

---

## 13. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Interest engine subtly wrong | Severe — destroys all trust | Pure module, exhaustive unit tests, published worked examples, user-visible derivations for every figure |
| Floating-point money drift | Severe | Integer minor units enforced end-to-end; lint rule against float arithmetic on money |
| Over-featured V1 dilutes the calm | High | One-question-per-screen rule enforced in design review; `LATER` items firmly held |
| Offline sync corrupts the ledger | High | Append-only semantics eliminate merge conflicts; idempotency keys eliminate duplicates |
| iOS PWA push limitations | Medium | In-app notification centre is primary; push is enhancement; installation prompted contextually |
| Migration from existing books is painful | Medium | CSV import with validation preview; backdated entries fully supported via `occurredAt` |
| Analytics slow as the ledger grows | Medium | `AnalyticsSnapshot` roll-ups; cursor pagination; virtualised lists |
| Single-user product limits reach | Low (V1) | Multi-tenant foundations in place from day one |

---

## 14. Delivery Plan

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1 | Product Requirements Document | **This document** — approved |
| 2 | Information Architecture | Approved |
| 3 | Database Schema | Approved |
| 4 | System Architecture | Approved |
| 5 | Folder Structure | Approved |
| 6 | API Design | Approved |
| 7 | Design System | Approved |
| 8 | UI Components | Delivered, awaiting approval |
| 9 | Complete UI Screens | — |
| 10 | Backend Implementation | — |
| 11 | Analytics Engine | — |
| 12 | Reminder Engine | — |
| 13 | Testing | — |
| 14 | Deployment | — |

Each phase requires explicit approval before the next begins.

---

## 15. Assumptions & Open Questions

### 15.1 Assumptions

| # | Assumption | If wrong |
| --- | --- | --- |
| A1 | Primary currency is INR; Indian numbering and UPI/WhatsApp conventions are the default context | Currency and locale are already tokenised; low cost to change |
| A2 | Rates are typically quoted **per month** | Rate period is stored explicitly; low cost |
| A3 | V1 serves a single user with no delegated access | Multi-tenant foundations already present; moderate cost |
| A4 | Borrowers do not get accounts or a portal in V1 | `linkedUserId` reserved; low cost |
| A5 | Mobile is the dominant surface; desktop is for review and reporting | Responsive throughout; low cost |
| A6 | Interest is collected periodically, principal returned in chunks or at close | Core to the engine model; **high** cost if wrong |

### 15.2 Open questions

| # | Question | Needed by | Default if unanswered |
| --- | --- | --- | --- |
| Q1 | Should penalty interest **accrue** in V1, or only be charged as a manual one-off event? | Phase 3 | Manual one-off event only |
| Q2 | Does a loan need multiple disbursement tranches, or is one disbursement per loan sufficient? | Phase 3 | Support multiple tranches — the ledger allows it naturally |
| Q3 | Should partial interest payments create a carry-forward balance or a separate arrears bucket? | Phase 3 | Carry-forward within the accrual period |
| Q4 | Is written-off principal recoverable later, and does recovery reopen the loan? | Phase 3 | Recovery recorded against the closed loan; loan stays closed |
| Q5 | Default grace window before a period is marked overdue? | Phase 3 | 5 days, configurable |
| Q6 | Should Orbit track the lender's own cost of capital, to compute net spread? | Phase 2 | Out of V1 scope |

---

## 16. Glossary

| Term | Definition |
| --- | --- |
| **Accrual** | Interest earned by the passage of time, whether or not it has been received |
| **Accrual period** | A dated slice of a loan over which a single interest amount accrues |
| **Anchor day** | The day-of-month on which a loan's accrual periods begin, derived from its start date |
| **Basis point** | One hundredth of a percent. 200 bps = 2% |
| **Collection rate** | Interest received ÷ interest due, over a defined window |
| **Day count** | The convention for converting elapsed days into a fraction of a year |
| **Flat interest** | Interest computed on the original principal for the whole tenure |
| **Grace window** | Days after a period ends before it is treated as overdue |
| **Ledger event** | An immutable record of something that happened to a loan |
| **Minor unit** | The smallest denomination of a currency — paise for INR |
| **Outstanding principal** | Capital currently deployed and not yet returned |
| **Reducing balance** | Interest computed on the current outstanding principal |
| **Reversal** | An immutable event that negates a specific prior event |
| **Write-off** | Explicit acknowledgement that outstanding capital will not be recovered |

---

*End of Phase 1.*
