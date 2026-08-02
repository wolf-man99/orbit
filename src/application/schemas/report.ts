/** Report contracts. (PRD RP-01 … RP-06) */
import { z } from 'zod'
import { monthSchema, uuidSchema } from './common'

export const reportKindSchema = z.enum(['PORTFOLIO', 'BORROWER', 'CASH_FLOW'])
export const reportFormatSchema = z.enum(['CSV', 'XLSX', 'PDF'])

export const generateReportSchema = z
  .object({
    kind: reportKindSchema,
    format: reportFormatSchema,
    from: monthSchema,
    to: monthSchema,
    borrowerId: uuidSchema.optional(),
  })
  .refine((v) => v.from <= v.to, 'the range must start before it ends')
  .refine(
    (v) => v.kind !== 'BORROWER' || v.borrowerId !== undefined,
    'a borrower report must name a borrower',
  )

export type GenerateReportCommand = z.infer<typeof generateReportSchema>
