/**
 * Reminder generation. (PRD R-01 … R-05, R-09)
 *
 * Pure: takes the portfolio's state and a date, returns the reminders that
 * should exist. Persisting them is the application layer's job.
 *
 * Generation is IDEMPOTENT by construction. Every reminder carries a natural
 * `dedupeKey` derived from what it is about, and the database has a unique
 * index on (userId, dedupeKey), so re-running the job upserts rather than
 * duplicating. A reminder engine that produces a second copy of yesterday's
 * nag is worse than one that does nothing.
 */
import { addDays, compareDates, type PlainDate } from '../../time'
import type { Minor } from '../../money'

export type ReminderType =
  | 'INTEREST_DUE'
  | 'OVERDUE'
  | 'LOAN_CLOSURE_DUE'
  | 'CONCENTRATION_WARNING'

export interface ReminderCandidate {
  readonly type: ReminderType
  readonly dedupeKey: string
  readonly dueOn: PlainDate
  readonly title: string
  readonly body: string
  /** Pre-scoped so acting on it takes one tap. (Phase 2 §12.2) */
  readonly deepLink: string
  readonly loanId?: string
  readonly borrowerId?: string
  readonly periodId?: string
}

export interface ReminderPeriod {
  readonly id: string
  readonly loanId: string
  readonly borrowerId: string
  readonly borrowerName: string
  readonly cycleIndex: number
  readonly dueOn: PlainDate
  readonly graceUntil: PlainDate
  readonly accrued: Minor
  readonly settled: Minor
}

export interface ReminderLoan {
  readonly id: string
  readonly borrowerId: string
  readonly borrowerName: string
  readonly expectedEndDate: PlainDate | null
  readonly status: string
}

export interface ReminderExposure {
  readonly borrowerId: string
  readonly borrowerName: string
  readonly shareBps: number
}

export interface GenerateInput {
  readonly asOf: PlainDate
  readonly periods: readonly ReminderPeriod[]
  readonly loans: readonly ReminderLoan[]
  readonly exposures: readonly ReminderExposure[]
  readonly closureLeadDays: number
  readonly concentrationWarnBps: number
}

const outstanding = (period: ReminderPeriod): bigint =>
  (period.accrued as bigint) - (period.settled as bigint)

export function generateReminders(input: GenerateInput): readonly ReminderCandidate[] {
  const candidates: ReminderCandidate[] = []

  for (const period of input.periods) {
    // A settled cycle needs no reminder, and an existing one auto-resolves
    // when the payment is recorded. (PRD R-05)
    if (outstanding(period) <= 0n) continue

    const pastGrace = compareDates(input.asOf, period.graceUntil) > 0
    const due = compareDates(input.asOf, period.dueOn) >= 0
    if (!due) continue

    const amount = outstanding(period)
    const link = `/transactions/new?loanId=${period.loanId}&periodId=${period.id}&amount=${amount}`

    candidates.push(
      pastGrace
        ? {
            type: 'OVERDUE',
            // Keyed on the cycle, so re-running the job never duplicates it.
            dedupeKey: `OVERDUE:${period.id}`,
            dueOn: input.asOf,
            title: `${period.borrowerName} — interest overdue`,
            // Factual, never punitive. (Phase 2 §15.2)
            body: `Interest for cycle ${period.cycleIndex} is past its grace window.`,
            deepLink: link,
            loanId: period.loanId,
            borrowerId: period.borrowerId,
            periodId: period.id,
          }
        : {
            type: 'INTEREST_DUE',
            dedupeKey: `INTEREST_DUE:${period.id}`,
            dueOn: period.dueOn,
            title: `${period.borrowerName} — interest due`,
            body: `Interest for cycle ${period.cycleIndex} is due.`,
            deepLink: link,
            loanId: period.loanId,
            borrowerId: period.borrowerId,
            periodId: period.id,
          },
    )
  }

  for (const loan of input.loans) {
    if (!loan.expectedEndDate) continue // open-ended tenure has no closure date
    if (loan.status === 'CLOSED' || loan.status === 'WRITTEN_OFF') continue
    const leadFrom = addDays(loan.expectedEndDate, -input.closureLeadDays)
    if (compareDates(input.asOf, leadFrom) < 0) continue
    candidates.push({
      type: 'LOAN_CLOSURE_DUE',
      dedupeKey: `LOAN_CLOSURE_DUE:${loan.id}:${loan.expectedEndDate}`,
      dueOn: leadFrom,
      title: `${loan.borrowerName} — loan reaching its end date`,
      body: `Expected to close on ${loan.expectedEndDate}.`,
      deepLink: `/loans/${loan.id}`,
      loanId: loan.id,
      borrowerId: loan.borrowerId,
    })
  }

  for (const exposure of input.exposures) {
    if (exposure.shareBps < input.concentrationWarnBps) continue
    candidates.push({
      type: 'CONCENTRATION_WARNING',
      // Keyed by month: the warning renews monthly rather than every night.
      dedupeKey: `CONCENTRATION:${exposure.borrowerId}:${input.asOf.slice(0, 7)}`,
      dueOn: input.asOf,
      title: `${exposure.borrowerName} holds a large share of your capital`,
      body: `${(exposure.shareBps / 100).toFixed(0)}% of outstanding capital is with one borrower.`,
      deepLink: `/borrowers/${exposure.borrowerId}`,
      borrowerId: exposure.borrowerId,
    })
  }

  return candidates
}

/** Reminders that a recorded payment should resolve. (PRD R-05) */
export function remindersResolvedBy(
  settledPeriodIds: readonly string[],
): readonly string[] {
  return settledPeriodIds.flatMap((id) => [`INTEREST_DUE:${id}`, `OVERDUE:${id}`])
}
