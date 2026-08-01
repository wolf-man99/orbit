/** Loan contracts. (PRD L-01 … L-11) */
import { z } from 'zod'
import {
  basisPointsSchema,
  currencySchema,
  idempotencyKeySchema,
  plainDateSchema,
  positiveMinorSchema,
  uuidSchema,
} from './common'

export const interestConventionSchema = z.enum([
  'FLAT',
  'REDUCING_SIMPLE',
  'COMPOUND',
  'AMORTIZED_EMI',
])
export const dayCountSchema = z.enum(['ACTUAL_365', 'ACTUAL_ACTUAL', 'THIRTY_360'])
export const ratePeriodSchema = z.enum(['MONTHLY', 'ANNUAL'])

export const loanTermsSchema = z.object({
  rateBps: basisPointsSchema,
  ratePeriod: ratePeriodSchema,
  convention: interestConventionSchema,
  dayCount: dayCountSchema,
  graceDays: z.number().int().min(0).max(180),
})

export const createLoanSchema = z
  .object({
    borrowerId: uuidSchema,
    principalMinor: positiveMinorSchema,
    currency: currencySchema.default('INR'),
    startDate: plainDateSchema,
    /** Null is a first-class case: open-ended tenure is the norm. (PRD L-02) */
    expectedEndDate: plainDateSchema.nullable().default(null),
    terms: loanTermsSchema,
    purpose: z.string().max(500).optional(),
    collateralNote: z.string().max(1000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine(
    (v) => v.expectedEndDate === null || v.expectedEndDate >= v.startDate,
    'expected end date cannot precede the start date',
  )

/**
 * Amendments are effective-dated and never retroactive: historical accruals
 * were computed against a different terms version that still exists. (PRD E-09)
 */
export const amendTermsSchema = z.object({
  effectiveFrom: plainDateSchema,
  terms: loanTermsSchema.partial(),
  reason: z.string().min(1).max(500),
  idempotencyKey: idempotencyKeySchema,
})

export const extendLoanSchema = z.object({
  expectedEndDate: plainDateSchema,
  reason: z.string().max(500).optional(),
  idempotencyKey: idempotencyKeySchema,
})

/**
 * Closure is blocked while anything is outstanding unless the caller explicitly
 * writes off the remainder with a reason. There is no third door. (PRD L-09)
 */
export const closeLoanSchema = z
  .object({
    closedOn: plainDateSchema,
    writeOffRemainder: z.boolean().default(false),
    reason: z.string().max(500).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine(
    (v) => !v.writeOffRemainder || (v.reason !== undefined && v.reason.length > 0),
    'writing off a remainder requires a reason',
  )

export type CreateLoanCommand = z.infer<typeof createLoanSchema>
export type AmendTermsCommand = z.infer<typeof amendTermsSchema>
export type CloseLoanCommand = z.infer<typeof closeLoanSchema>
