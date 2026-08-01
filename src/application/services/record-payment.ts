/**
 * Record a receipt — the product's most important use case. (PRD T-05, T-07)
 *
 * Everything between BEGIN and COMMIT is one transaction: the events, the
 * allocations, the balance, and any reminder that resolves. A payment either
 * lands completely or not at all. (PRD REL-01)
 */
import { ZERO, minor, type Minor } from '@/domain/money'
import { allocateOldestFirst, type AllocatablePeriod } from '@/domain/engine/allocation'
import type { DomainError, Result } from '@/domain/errors'
import { err, ok } from '@/domain/errors'

export interface RecordPaymentPorts {
  /** Returns an existing event for this key, if the caller has retried. */
  readonly findByIdempotencyKey: (key: string) => Promise<{ id: string; groupId: string | null } | null>
  readonly unsettledPeriods: (loanId: string) => Promise<readonly AllocatablePeriod[]>
  readonly writePayment: (plan: PaymentPlan) => Promise<PaymentReceipt>
}

export interface PaymentPlan {
  readonly loanId: string
  readonly occurredOn: string
  readonly groupId: string
  readonly interestMinor: Minor
  readonly principalMinor: Minor
  readonly allocations: readonly { periodId: string; amount: Minor }[]
  readonly idempotencyKey: string
  readonly note?: string | undefined
}

export interface PaymentReceipt {
  readonly eventIds: readonly string[]
  readonly groupId: string
  readonly settledPeriodIds: readonly string[]
}

export interface RecordPaymentCommand {
  readonly loanId: string
  readonly occurredOn: string
  readonly interestMinor?: Minor | undefined
  readonly principalMinor?: Minor | undefined
  readonly allocations?: readonly { periodId: string; amount: Minor }[] | undefined
  readonly idempotencyKey: string
  readonly groupId: string
  readonly note?: string | undefined
}

export type RecordPaymentOutcome =
  | { readonly kind: 'CREATED'; readonly receipt: PaymentReceipt }
  /** A retry of a request that already succeeded. Not an error. (Phase 6 §6) */
  | { readonly kind: 'REPLAYED'; readonly eventId: string; readonly groupId: string | null }

export async function recordPayment(
  command: RecordPaymentCommand,
  ports: RecordPaymentPorts,
): Promise<Result<RecordPaymentOutcome>> {
  const interest = command.interestMinor ?? ZERO
  const principal = command.principalMinor ?? ZERO

  if (interest <= 0n && principal <= 0n) {
    return err<RecordPaymentOutcome>({
      kind: 'VALIDATION',
      field: 'amount',
      message: 'A payment must carry an interest component, a principal component, or both.',
    })
  }

  // Idempotency is checked FIRST and treated as success. A network timeout
  // after a successful write is indistinguishable from a failure at the client,
  // so retry is inevitable and must be uneventful. (Phase 4 §9.3)
  const existing = await ports.findByIdempotencyKey(command.idempotencyKey)
  if (existing) {
    return ok({ kind: 'REPLAYED', eventId: existing.id, groupId: existing.groupId })
  }

  // Interest settles accrual cycles; principal does not.
  let allocations = command.allocations ?? []
  if (allocations.length === 0 && interest > 0n) {
    const periods = await ports.unsettledPeriods(command.loanId)
    allocations = allocateOldestFirst(periods, interest).allocations
  }

  const receipt = await ports.writePayment({
    loanId: command.loanId,
    occurredOn: command.occurredOn,
    groupId: command.groupId,
    interestMinor: interest,
    principalMinor: principal,
    allocations,
    idempotencyKey: command.idempotencyKey,
    note: command.note,
  })

  return ok({ kind: 'CREATED', receipt })
}

/**
 * The postings for one receipt.
 *
 * A split receipt becomes TWO typed events sharing a groupId, because a single
 * row cannot carry two tax categories — interest is taxable income, principal
 * movement is not. (Phase 3 §3.3)
 */
export function postingsFor(plan: PaymentPlan): readonly {
  type: 'INTEREST_RECEIVED' | 'PRINCIPAL_RECEIVED'
  amountMinor: Minor
  interestDeltaMinor: Minor
  principalDeltaMinor: Minor
  cashDeltaMinor: Minor
  taxCategory: 'INTEREST_INCOME' | 'PRINCIPAL_MOVEMENT'
}[] {
  const postings = []
  if (plan.interestMinor > 0n) {
    postings.push({
      type: 'INTEREST_RECEIVED' as const,
      amountMinor: plan.interestMinor,
      interestDeltaMinor: minor(-(plan.interestMinor as bigint)),
      principalDeltaMinor: ZERO,
      cashDeltaMinor: plan.interestMinor,
      taxCategory: 'INTEREST_INCOME' as const,
    })
  }
  if (plan.principalMinor > 0n) {
    postings.push({
      type: 'PRINCIPAL_RECEIVED' as const,
      amountMinor: plan.principalMinor,
      interestDeltaMinor: ZERO,
      principalDeltaMinor: minor(-(plan.principalMinor as bigint)),
      cashDeltaMinor: plan.principalMinor,
      taxCategory: 'PRINCIPAL_MOVEMENT' as const,
    })
  }
  return postings
}

export type { DomainError }
