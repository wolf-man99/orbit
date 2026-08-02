import { cookies } from 'next/headers'
import type { RequestContext } from '@/application/queries/ports'
import { contextFor, supabaseAuth, type AuthAdapter, type SessionUser } from '@/infrastructure/auth'
import { withTenant } from '@/infrastructure/db'
import {
  postingsFor,
  type RecordPaymentPorts,
} from '@/application/services/record-payment'
import { hasAuth, hasDatabase } from './env'

/**
 * Session resolution. (Q41)
 *
 * Lives in the composition root because it needs both `infrastructure/auth` and
 * `application`. Routes call `requireContext()` and never learn which adapter
 * answered.
 */

/** The demo identity used when no Supabase project is configured. */
const DEMO_USER: SessionUser = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'demo@orbit.local',
  timeZone: 'Asia/Kolkata',
}

export async function authAdapter(): Promise<AuthAdapter> {
  const store = await cookies()
  return supabaseAuth({
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (next) => {
      for (const cookie of next) {
        // Wrapped: Next throws when cookies are set from a Server Component,
        // and a read-only render must not fail merely because Supabase
        // attempted a token refresh.
        try {
          store.set(cookie.name, cookie.value, cookie.options ?? {})
        } catch {
          /* not writable in this context */
        }
      }
    },
  })
}

export async function currentUser(): Promise<SessionUser | null> {
  if (!hasAuth()) return DEMO_USER
  return (await authAdapter()).currentUser()
}

/**
 * The portfolio the request acts on.
 *
 * Resolved server-side from the session — never from a parameter. An endpoint
 * accepting a portfolio id would make every tenancy control in Phases 3 and 4
 * bypassable by editing a JSON body.
 */
async function defaultPortfolioId(user: SessionUser): Promise<string> {
  if (!hasDatabase()) return 'demo-portfolio'
  return withTenant(
    user.userId,
    async (db) => {
      const portfolio = await db.portfolio.findFirst({
        where: { userId: user.userId, isDefault: true, archivedAt: null },
        select: { id: true },
      })
      if (portfolio) return portfolio.id
      // The auth bridge creates one on sign-up; reaching here means a user row
      // exists without a portfolio, which is a data problem worth naming.
      throw new Error(`no default portfolio for user ${user.userId}`)
    },
    { readOnly: true },
  )
}

/** Null when unauthenticated. Callers redirect; this never throws for that. */
export async function requestContext(): Promise<RequestContext | null> {
  const user = await currentUser()
  if (!user) return null
  return contextFor(user, await defaultPortfolioId(user))
}

// ---------------------------------------------------------------------------
// Mutation ports
// ---------------------------------------------------------------------------

/**
 * Binds the payment use case to the database.
 *
 * Everything between BEGIN and COMMIT is one transaction: the events, the
 * allocations, the balance, and any reminder that resolves. A payment either
 * lands completely or not at all. (PRD REL-01)
 */
export function paymentPorts(context: RequestContext): RecordPaymentPorts {
  const tenant = { userId: context.userId, portfolioId: context.portfolioId }

  return {
    findByIdempotencyKey: async (key) => {
      if (!hasDatabase()) return null
      return withTenant(
        context.userId,
        async (db) => {
          const existing = await db.ledgerEvent.findFirst({
            where: { userId: tenant.userId, idempotencyKey: key },
            select: { id: true, groupId: true },
          })
          return existing
        },
        { readOnly: true },
      )
    },

    unsettledPeriods: async (loanId) => {
      if (!hasDatabase()) return []
      return withTenant(
        context.userId,
        async (db) => {
          const periods = await db.accrualPeriod.findMany({
            where: {
              loanId,
              userId: tenant.userId,
              status: { in: ['DUE', 'OVERDUE', 'PARTIAL'] },
            },
            orderBy: { cycleIndex: 'asc' },
            select: { id: true, cycleIndex: true, accruedMinor: true, settledMinor: true },
          })
          return periods.map((period) => ({
            id: period.id,
            cycleIndex: period.cycleIndex,
            accrued: period.accruedMinor as never,
            alreadySettled: period.settledMinor as never,
          }))
        },
        { readOnly: true },
      )
    },

    writePayment: async (plan) => {
      if (!hasDatabase()) {
        throw new Error('composition: cannot record a payment without a database')
      }
      return withTenant(context.userId, async (db) => {
        const loan = await db.loan.findFirst({
          where: { id: plan.loanId, userId: tenant.userId },
          select: { id: true, borrowerId: true, currency: true },
        })
        if (!loan) throw new Error(`loan ${plan.loanId} not found`)

        const occurredAt = new Date(`${plan.occurredOn}T00:00:00Z`)
        const eventIds: string[] = []

        for (const posting of postingsFor(plan)) {
          const event = await db.ledgerEvent.create({
            data: {
              userId: tenant.userId,
              portfolioId: tenant.portfolioId,
              borrowerId: loan.borrowerId,
              loanId: loan.id,
              type: posting.type,
              groupId: plan.groupId,
              occurredAt,
              currency: loan.currency,
              amountMinor: posting.amountMinor,
              interestDeltaMinor: posting.interestDeltaMinor,
              principalDeltaMinor: posting.principalDeltaMinor,
              cashDeltaMinor: posting.cashDeltaMinor,
              taxCategory: posting.taxCategory,
              note: plan.note ?? null,
              // Suffixed per posting: a split receipt writes two events, and the
              // unique constraint is on (userId, idempotencyKey).
              idempotencyKey: `${plan.idempotencyKey}:${posting.type}`,
              createdBy: tenant.userId,
            },
            select: { id: true },
          })
          eventIds.push(event.id)

          if (posting.type === 'INTEREST_RECEIVED') {
            for (const allocation of plan.allocations) {
              await db.paymentAllocation.create({
                data: {
                  userId: tenant.userId,
                  eventId: event.id,
                  periodId: allocation.periodId,
                  amountMinor: allocation.amount,
                },
              })
            }
          }
        }

        // Reminders for a settled cycle resolve automatically. (PRD R-05)
        const settledPeriodIds = plan.allocations.map((allocation) => allocation.periodId)
        if (settledPeriodIds.length > 0) {
          await db.reminder.updateMany({
            where: {
              userId: tenant.userId,
              periodId: { in: settledPeriodIds },
              status: { in: ['PENDING', 'SNOOZED'] },
            },
            data: { status: 'RESOLVED', resolvedAt: new Date() },
          })
        }

        return { eventIds, groupId: plan.groupId, settledPeriodIds }
      })
    },
  }
}
