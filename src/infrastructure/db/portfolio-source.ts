/**
 * The Postgres `PortfolioSource`. (Q35)
 *
 * A peer of the seeded source, not a replacement for it: both satisfy the same
 * port, so every screen and every read model is identical against either.
 *
 * All reads happen inside ONE `withTenant` transaction — the boundary is the
 * loader, not the query, so BEGIN/SET LOCAL/COMMIT is amortised across the
 * parallel reads rather than paid per query. (Phase 4 §7.3)
 */
import { minor, type Minor } from '@/domain/money'
import { plainDate, type PlainDate } from '@/domain/time'
import type { LedgerRecord, LoanRecord, PortfolioSource } from '@/application/queries/ports'
import { withTenant, type TenantDb } from './tenant'
import { accrualRepo, ledgerRepo, loanRepo, portfolioRepo, type Tenant } from './repositories'

/** A timestamptz reduced to the user's calendar date. Never bucketed in UTC. */
function toPlainDate(value: Date, timeZone: string): PlainDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value)
  return plainDate(parts)
}

export interface TenantContext extends Tenant {
  readonly timeZone: string
  /** Injected rather than read from a clock, so a request is reproducible. */
  readonly now: Date
}

export function databaseSource(context: TenantContext): PortfolioSource {
  const asOf = toPlainDate(context.now, context.timeZone)

  const readLoans = async (): Promise<readonly LoanRecord[]> =>
    withTenant(
      context.userId,
      async (db: TenantDb) => {
        const [loans, periods] = await Promise.all([
          loanRepo.openLoans(db, context),
          accrualRepo.unsettled(db, context),
        ])

        const settledByLoan = new Map<string, Map<number, Minor>>()
        for (const period of periods) {
          const forLoan = settledByLoan.get(period.loanId) ?? new Map<number, Minor>()
          forLoan.set(period.cycleIndex, minor(period.settledMinor))
          settledByLoan.set(period.loanId, forLoan)
        }

        return loans.map(
          (loan): LoanRecord => ({
            id: loan.id,
            borrowerId: loan.borrowerId,
            borrowerName: loan.borrower.fullName,
            relationshipTag: loan.borrower.relationshipTag,
            startDate: toPlainDate(loan.startDate, context.timeZone),
            closedOn: loan.closedOn ? toPlainDate(loan.closedOn, context.timeZone) : null,
            currency: loan.currency,
            terms: loan.terms.map((term) => ({
              effectiveFrom: toPlainDate(term.effectiveFrom, context.timeZone),
              rateBps: term.rateBps,
              ratePeriod: term.ratePeriod,
              convention: term.convention,
              dayCount: term.dayCount,
              graceDays: term.graceDays,
              anchorDay: term.anchorDay,
            })),
            principalEvents: [],
            settledByCycle: settledByLoan.get(loan.id) ?? new Map(),
          }),
        )
      },
      { readOnly: true },
    )

  const readLedger = async (): Promise<readonly LedgerRecord[]> =>
    withTenant(
      context.userId,
      async (db: TenantDb) => {
        const events = await ledgerRepo.recent(db, context, 200)
        return events
          .filter((event) =>
            ['LOAN_DISBURSED', 'INTEREST_RECEIVED', 'PRINCIPAL_RECEIVED'].includes(event.type),
          )
          .map(
            (event): LedgerRecord => ({
              id: event.id,
              borrowerId: event.borrowerId ?? '',
              borrowerName: event.borrower?.fullName ?? 'Unknown',
              type: event.type as LedgerRecord['type'],
              amount: minor(event.amountMinor),
              // occurredAt, never recordedAt: all arithmetic uses when the
              // money actually moved. (Phase 3 §3)
              occurredOn: toPlainDate(event.occurredAt, context.timeZone),
              note: event.note ?? undefined,
            }),
          )
      },
      { readOnly: true },
    )

  return {
    asOf: () => Promise.resolve(asOf),
    loans: readLoans,
    ledger: readLedger,
    settings: () =>
      withTenant(
        context.userId,
        async (db: TenantDb) => {
          const portfolio = await portfolioRepo.defaultFor(db, context.userId)
          return {
            currency: portfolio?.currency ?? 'INR',
            anchorToStartDay: portfolio?.anchorToStartDay ?? true,
            concentrationWarnBps: portfolio?.concentrationWarnBps ?? 2500,
            closureLeadDays: 7,
          }
        },
        { readOnly: true },
      ),
  }
}
