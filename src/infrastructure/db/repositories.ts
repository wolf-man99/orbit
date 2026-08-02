/**
 * Repositories. (Phase 4 §5.1, §7)
 *
 * Every function takes a `TenantDb` as its first argument, which it can only
 * have received from `withTenant`. Tenancy is therefore a compile-time property
 * of a query, not a convention someone has to remember. The explicit `userId`
 * filters below are deliberate belt-and-braces alongside RLS. (Phase 4 §7.4)
 */
import type { TenantDb } from './tenant'

export interface Tenant {
  readonly userId: string
  readonly portfolioId: string
}

// ---------------------------------------------------------------------------
// Borrowers
// ---------------------------------------------------------------------------

export const borrowerRepo = {
  async list(db: TenantDb, tenant: Tenant, opts: { includeArchived?: boolean } = {}) {
    return db.borrower.findMany({
      where: {
        userId: tenant.userId,
        portfolioId: tenant.portfolioId,
        ...(opts.includeArchived ? {} : { archivedAt: null }),
      },
      include: { loans: { include: { balance: true } } },
      orderBy: { fullName: 'asc' },
    })
  },

  async byId(db: TenantDb, tenant: Tenant, id: string) {
    return db.borrower.findFirst({
      where: { id, userId: tenant.userId },
      include: {
        loans: { include: { balance: true, terms: { orderBy: { version: 'asc' } } } },
        notes: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
  },

  async create(db: TenantDb, tenant: Tenant, data: Record<string, unknown>) {
    return db.borrower.create({
      data: { ...data, userId: tenant.userId, portfolioId: tenant.portfolioId } as never,
    })
  },
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

export const loanRepo = {
  async byId(db: TenantDb, tenant: Tenant, id: string) {
    return db.loan.findFirst({
      where: { id, userId: tenant.userId },
      include: {
        borrower: true,
        balance: true,
        terms: { orderBy: { version: 'asc' } },
        periods: { orderBy: { cycleIndex: 'asc' }, include: { segments: true } },
      },
    })
  },

  /** Everything the accrual engine needs for one loan, in a single read. */
  async accrualInputs(db: TenantDb, tenant: Tenant, loanId: string) {
    const [loan, principalEvents] = await Promise.all([
      db.loan.findFirst({
        where: { id: loanId, userId: tenant.userId },
        include: { terms: { orderBy: { effectiveFrom: 'asc' } } },
      }),
      db.ledgerEvent.findMany({
        where: {
          loanId,
          userId: tenant.userId,
          type: { in: ['LOAN_DISBURSED', 'PRINCIPAL_RECEIVED', 'REVERSAL', 'ADJUSTMENT'] },
        },
        orderBy: { occurredAt: 'asc' },
        select: { occurredAt: true, principalDeltaMinor: true },
      }),
    ])
    return { loan, principalEvents }
  },

  async openLoans(db: TenantDb, tenant: Tenant) {
    return db.loan.findMany({
      where: {
        userId: tenant.userId,
        portfolioId: tenant.portfolioId,
        status: { in: ['ACTIVE', 'DUE', 'OVERDUE'] },
      },
      include: { borrower: true, balance: true, terms: { orderBy: { effectiveFrom: 'asc' } } },
    })
  },

  /**
   * Principal-affecting events for a set of loans, in one query.
   *
   * The engine cannot compute anything without these: an accrual basis IS the
   * principal timeline. Fetching them per loan would issue N queries inside the
   * tenant transaction, so they are batched and grouped in memory.
   *
   * REVERSAL and ADJUSTMENT are included because both carry a signed
   * principalDelta — a reversed disbursement must remove its principal from the
   * basis, or the engine keeps accruing on money that was never lent.
   */
  async principalEventsFor(db: TenantDb, tenant: Tenant, loanIds: readonly string[]) {
    if (loanIds.length === 0) return []
    return db.ledgerEvent.findMany({
      where: {
        userId: tenant.userId,
        loanId: { in: [...loanIds] },
        principalDeltaMinor: { not: 0n },
      },
      orderBy: [{ occurredAt: 'asc' }, { seq: 'asc' }],
      select: { loanId: true, occurredAt: true, principalDeltaMinor: true },
    })
  },
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export const ledgerRepo = {
  /**
   * Cursor-paginated timeline, ordered by (occurredAt, seq).
   *
   * Never offset: the ledger appends continuously, so an offset query silently
   * skips or repeats rows that shifted between requests. (Phase 6 §7)
   */
  async page(
    db: TenantDb,
    tenant: Tenant,
    opts: { cursor?: { occurredAt: Date; seq: bigint }; limit?: number } = {},
  ) {
    const limit = opts.limit ?? 25
    return db.ledgerEvent.findMany({
      where: {
        userId: tenant.userId,
        portfolioId: tenant.portfolioId,
        ...(opts.cursor
          ? {
              OR: [
                { occurredAt: { lt: opts.cursor.occurredAt } },
                { occurredAt: opts.cursor.occurredAt, seq: { lt: opts.cursor.seq } },
              ],
            }
          : {}),
      },
      include: { borrower: true, loan: true },
      orderBy: [{ occurredAt: 'desc' }, { seq: 'desc' }],
      take: limit + 1, // one extra row tells us whether another page exists
    })
  },

  async recent(db: TenantDb, tenant: Tenant, take = 10) {
    return db.ledgerEvent.findMany({
      where: { userId: tenant.userId, portfolioId: tenant.portfolioId },
      include: { borrower: true },
      orderBy: [{ occurredAt: 'desc' }, { seq: 'desc' }],
      take,
    })
  },

  async byIdempotencyKey(db: TenantDb, tenant: Tenant, key: string) {
    return db.ledgerEvent.findFirst({
      where: { userId: tenant.userId, idempotencyKey: key },
    })
  },
}

// ---------------------------------------------------------------------------
// Accrual
// ---------------------------------------------------------------------------

export const accrualRepo = {
  async unsettled(db: TenantDb, tenant: Tenant) {
    return db.accrualPeriod.findMany({
      where: {
        userId: tenant.userId,
        portfolioId: tenant.portfolioId,
        status: { in: ['DUE', 'OVERDUE', 'PARTIAL'] },
      },
      include: { loan: { include: { borrower: true } } },
      orderBy: { dueOn: 'asc' },
    })
  },

  async forLoan(db: TenantDb, tenant: Tenant, loanId: string) {
    return db.accrualPeriod.findMany({
      where: { loanId, userId: tenant.userId },
      orderBy: { cycleIndex: 'asc' },
      include: { segments: { orderBy: { segmentIndex: 'asc' } } },
    })
  },
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export const reminderRepo = {
  async pending(db: TenantDb, tenant: Tenant, onOrBefore: Date) {
    return db.reminder.findMany({
      where: {
        userId: tenant.userId,
        portfolioId: tenant.portfolioId,
        status: { in: ['PENDING', 'SNOOZED'] },
        dueOn: { lte: onOrBefore },
      },
      include: { borrower: true, loan: true },
      orderBy: { dueOn: 'asc' },
    })
  },
}

export const portfolioRepo = {
  async defaultFor(db: TenantDb, userId: string) {
    return db.portfolio.findFirst({ where: { userId, isDefault: true, archivedAt: null } })
  },

  async snapshots(db: TenantDb, tenant: Tenant, take = 12) {
    return db.portfolioSnapshot.findMany({
      where: { userId: tenant.userId, portfolioId: tenant.portfolioId },
      orderBy: { periodMonth: 'desc' },
      take,
    })
  },
}
