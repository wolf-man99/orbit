/** Borrower contracts. (PRD B-09, B-10, BP-10) */
import { z } from 'zod'
import { idempotencyKeySchema, plainDateSchema } from './common'

export const relationshipTagSchema = z.enum([
  'FAMILY',
  'FRIEND',
  'BUSINESS',
  'REFERRAL',
  'COMMUNITY',
  'OTHER',
])

export const borrowerStatusSchema = z.enum([
  'ACTIVE',
  'DUE_SOON',
  'OVERDUE',
  'DORMANT',
  'CLOSED',
  'ARCHIVED',
])

export const createBorrowerSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().max(32).optional(),
  email: z.email().optional(),
  address: z.string().max(500).optional(),
  /** A free-text reference such as "PAN on file". Never a raw government ID. */
  idReference: z.string().max(100).optional(),
  relationshipTag: relationshipTagSchema.default('OTHER'),
  relationshipSince: plainDateSchema.optional(),
  tags: z.array(z.string().max(40)).max(10).default([]),
  photoUrl: z.url().optional(),
  idempotencyKey: idempotencyKeySchema,
})

export const updateBorrowerSchema = createBorrowerSchema
  .omit({ idempotencyKey: true })
  .partial()

/**
 * Status is absent from both schemas by design: it is derived from the
 * borrower's loans and the clock, never set by hand. (PRD B-05)
 */
export const borrowerFilterSchema = z.object({
  q: z.string().max(200).optional(),
  status: z.array(borrowerStatusSchema).optional(),
  tag: z.string().max(40).optional(),
  minOutstandingMinor: z.string().regex(/^\d+$/).optional(),
  maxOutstandingMinor: z.string().regex(/^\d+$/).optional(),
  includeArchived: z.coerce.boolean().default(false),
})

export const addNoteSchema = z.object({
  body: z.string().min(1).max(4000),
  idempotencyKey: idempotencyKeySchema,
})

export const archiveBorrowerSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
})

export type CreateBorrowerCommand = z.infer<typeof createBorrowerSchema>
export type UpdateBorrowerCommand = z.infer<typeof updateBorrowerSchema>
export type BorrowerFilter = z.infer<typeof borrowerFilterSchema>
