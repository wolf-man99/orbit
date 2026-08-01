/**
 * Ledger command contracts. (PRD §6.5, T-05 … T-08)
 *
 * Every mutation here is a COMMAND, not a resource edit. There is no PUT and no
 * DELETE anywhere in the ledger surface — the HTTP verbs mirror the database's
 * append-only guarantee, so a client cannot even express "change this event".
 */
import { z } from 'zod'
import {
  idempotencyKeySchema,
  minorSchema,
  plainDateSchema,
  positiveMinorSchema,
  uuidSchema,
} from './common'

export const ledgerEventTypeSchema = z.enum([
  'LOAN_DISBURSED',
  'INTEREST_RECEIVED',
  'PRINCIPAL_RECEIVED',
  'PENALTY_CHARGED',
  'PENALTY_WAIVED',
  'ADJUSTMENT',
  'REVERSAL',
  'LOAN_CLOSED',
  'LOAN_WRITTEN_OFF',
  'LOAN_EXTENDED',
  'LOAN_TERMS_AMENDED',
  'NOTE_ADDED',
  'DOCUMENT_UPLOADED',
  'REMINDER_SENT',
])

/** Explicit override of the engine's oldest-first suggestion. (PRD E-11) */
export const allocationSchema = z.object({
  periodId: uuidSchema,
  amountMinor: positiveMinorSchema,
})

/**
 * Record a receipt — the product's most important mutation.
 *
 * A single call may carry both an interest and a principal component. The
 * service writes them as two typed ledger events sharing a groupId, because a
 * single row cannot hold two tax categories. (Phase 3 §3.3)
 */
export const recordPaymentSchema = z
  .object({
    loanId: uuidSchema,
    /** When the money actually moved, which may be days before it was recorded. */
    occurredOn: plainDateSchema,
    interestMinor: positiveMinorSchema.optional(),
    principalMinor: positiveMinorSchema.optional(),
    /** Omit to let the engine allocate oldest-first. */
    allocations: z.array(allocationSchema).max(60).optional(),
    note: z.string().max(2000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine(
    (v) => v.interestMinor !== undefined || v.principalMinor !== undefined,
    'a payment must carry an interest component, a principal component, or both',
  )
  .refine(
    (v) =>
      v.allocations === undefined ||
      v.interestMinor === undefined ||
      v.allocations.reduce((sum, a) => sum + a.amountMinor, 0n) <= v.interestMinor,
    'allocations cannot exceed the interest component',
  )

export const disburseSchema = z.object({
  loanId: uuidSchema,
  occurredOn: plainDateSchema,
  amountMinor: positiveMinorSchema,
  note: z.string().max(2000).optional(),
  idempotencyKey: idempotencyKeySchema,
})

export const chargePenaltySchema = z.object({
  loanId: uuidSchema,
  occurredOn: plainDateSchema,
  amountMinor: positiveMinorSchema,
  reason: z.string().min(1).max(500),
  idempotencyKey: idempotencyKeySchema,
})

/** Corrections are appends, never edits. Reason is mandatory. (PRD T-08) */
export const reverseEventSchema = z.object({
  reason: z.string().min(1, 'a reversal must say why').max(500),
  idempotencyKey: idempotencyKeySchema,
})

export const adjustmentSchema = z.object({
  loanId: uuidSchema,
  occurredOn: plainDateSchema,
  principalDeltaMinor: minorSchema.optional(),
  interestDeltaMinor: minorSchema.optional(),
  penaltyDeltaMinor: minorSchema.optional(),
  reason: z.string().min(1, 'an adjustment must say why').max(500),
  idempotencyKey: idempotencyKeySchema,
})

/** Month-end catch-up across several borrowers in one commit. (PRD T-13) */
export const bulkPaymentSchema = z.object({
  occurredOn: plainDateSchema,
  entries: z
    .array(
      z.object({
        loanId: uuidSchema,
        interestMinor: positiveMinorSchema.optional(),
        principalMinor: positiveMinorSchema.optional(),
      }),
    )
    .min(1)
    .max(100),
  idempotencyKey: idempotencyKeySchema,
})

export const transactionFilterSchema = z.object({
  type: z.array(ledgerEventTypeSchema).optional(),
  borrowerId: uuidSchema.optional(),
  loanId: uuidSchema.optional(),
  from: plainDateSchema.optional(),
  to: plainDateSchema.optional(),
  minAmountMinor: minorSchema.optional(),
  maxAmountMinor: minorSchema.optional(),
  q: z.string().max(200).optional(),
  /** Reversed events are hidden by default; the audit view opts in. */
  includeReversed: z.coerce.boolean().default(false),
})

export type RecordPaymentCommand = z.infer<typeof recordPaymentSchema>
export type ReverseEventCommand = z.infer<typeof reverseEventSchema>
export type BulkPaymentCommand = z.infer<typeof bulkPaymentSchema>
export type TransactionFilter = z.infer<typeof transactionFilterSchema>
