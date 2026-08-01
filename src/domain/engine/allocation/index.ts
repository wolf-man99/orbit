/**
 * Receipt allocation. (PRD E-11)
 *
 * A receipt settles accrual cycles oldest-first by default, because that is how
 * a lender reconciles by hand and because leaving an older cycle unsettled while
 * a newer one is paid would report a borrower as overdue when they are current.
 *
 * Pure: takes cycles and an amount, returns the split. Persisting it is the
 * application layer's job.
 */
import { ZERO, type Minor } from '../../money'

export interface AllocatablePeriod {
  readonly id: string
  readonly cycleIndex: number
  readonly accrued: Minor
  readonly alreadySettled: Minor
}

export interface Allocation {
  readonly periodId: string
  readonly amount: Minor
}

export interface AllocationResult {
  readonly allocations: readonly Allocation[]
  /** Paid beyond what is currently accrued — an advance, not an error. */
  readonly unallocated: Minor
}

/**
 * Splits `amount` across `periods`, oldest first.
 *
 * Any surplus is returned as `unallocated` rather than forced onto a cycle.
 * Paying ahead is legitimate and common; silently attaching it to a future
 * cycle that has not accrued yet would invent interest that has not been
 * earned.
 */
export function allocateOldestFirst(
  periods: readonly AllocatablePeriod[],
  amount: Minor,
): AllocationResult {
  if (amount <= 0n) return { allocations: [], unallocated: ZERO }

  const ordered = [...periods].sort((a, b) => a.cycleIndex - b.cycleIndex)
  const allocations: Allocation[] = []
  let remaining = amount as bigint

  for (const period of ordered) {
    if (remaining <= 0n) break
    const outstanding = (period.accrued as bigint) - (period.alreadySettled as bigint)
    if (outstanding <= 0n) continue
    const applied = remaining < outstanding ? remaining : outstanding
    allocations.push({ periodId: period.id, amount: applied as Minor })
    remaining -= applied
  }

  return { allocations, unallocated: remaining as Minor }
}

/** Validates a caller-supplied override before it is persisted. */
export function validateAllocations(
  periods: readonly AllocatablePeriod[],
  allocations: readonly Allocation[],
  amount: Minor,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const byId = new Map(periods.map((p) => [p.id, p]))
  let total = 0n

  for (const allocation of allocations) {
    const period = byId.get(allocation.periodId)
    if (!period) return { ok: false, reason: `unknown accrual period ${allocation.periodId}` }
    if (allocation.amount <= 0n) return { ok: false, reason: 'an allocation must be positive' }
    const outstanding = (period.accrued as bigint) - (period.alreadySettled as bigint)
    if ((allocation.amount as bigint) > outstanding) {
      return { ok: false, reason: `allocation exceeds what cycle ${period.cycleIndex} still owes` }
    }
    total += allocation.amount as bigint
  }

  if (total > (amount as bigint)) {
    return { ok: false, reason: 'allocations exceed the amount received' }
  }
  return { ok: true }
}
