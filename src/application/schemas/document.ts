/** Document contracts. (PRD DOC-01 … DOC-05) */
import { z } from 'zod'
import { idempotencyKeySchema, uuidSchema } from './common'

export const documentTypeSchema = z.enum([
  'AGREEMENT', 'CHEQUE', 'ID_PROOF', 'RECEIPT', 'OTHER',
])

/** 10 MB. Images are compressed client-side before they reach this. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
] as const

/**
 * Step 1: ask for a signed upload URL.
 *
 * The file never passes through the application server. It goes straight to
 * private storage under a short-lived signed URL, which keeps a 10 MB upload
 * off the request path and means the bucket is never public. (PRD SEC-04)
 */
export const requestUploadSchema = z.object({
  borrowerId: uuidSchema.optional(),
  loanId: uuidSchema.optional(),
  type: documentTypeSchema.default('OTHER'),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
}).refine(
  (v) => v.borrowerId !== undefined || v.loanId !== undefined,
  'a document must attach to a borrower or a loan',
)

/** Step 2: confirm the upload landed, which is what creates the row. */
export const confirmUploadSchema = z.object({
  storagePath: z.string().min(1).max(500),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  idempotencyKey: idempotencyKeySchema,
})

export type RequestUploadCommand = z.infer<typeof requestUploadSchema>
export type ConfirmUploadCommand = z.infer<typeof confirmUploadSchema>
