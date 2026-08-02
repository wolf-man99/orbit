import { describe, expect, it } from 'vitest'
import { minor } from '@/domain/money'
import { plainDate } from '@/domain/time'
import { csvField, summarise, toCsv, type ReportMeta, type ReportRow } from '@/application/services/reports'
import { confirmUploadSchema, generateReportSchema, requestUploadSchema, verifyOtpSchema } from '@/application/schemas'

const meta: ReportMeta = {
  title: 'Monthly portfolio', generatedAt: '2026-05-20T10:32:00+05:30',
  engineVersion: 'accrual-1.0.0', currency: 'INR',
}
const rows: readonly ReportRow[] = [
  { occurredOn: plainDate('2026-04-14'), borrower: 'Ravi Sharma',
    type: 'Interest received', amount: minor(1_000_000n) },
]

describe('CSV injection (PRD RP-04)', () => {
  it('neutralises a leading = so a spreadsheet cannot execute it', () => {
    // A financial export is exactly the file a user opens without thinking.
    expect(csvField('=1+1')).toBe('"\'=1+1"')
    expect(csvField('+cmd|calc')).toContain("'+")
    expect(csvField('-2+3')).toContain("'-")
    expect(csvField('@SUM(A1)')).toContain("'@")
  })

  it('leaves an ordinary note alone', () => {
    expect(csvField('UPI ref 4429')).toBe('UPI ref 4429')
  })

  it('quotes and escapes commas, quotes, and newlines', () => {
    expect(csvField('Sharma, Ravi')).toBe('"Sharma, Ravi"')
    expect(csvField('He said "yes"')).toBe('"He said ""yes"""')
    expect(csvField('line\nbreak')).toBe('"line\nbreak"')
  })
})

describe('CSV output', () => {
  it('exports the exact decimal, not a grouped display figure', () => {
    // A spreadsheet must receive a number it can compute with.
    const csv = toCsv(rows, meta)
    expect(csv).toContain('10000.00')
    expect(csv).not.toContain('₹')
    expect(csv).not.toContain('10,000')
  })

  it('ends with a newline so the last row is never dropped', () => {
    expect(toCsv(rows, meta).endsWith('\n')).toBe(true)
  })

  it('handles an empty report without producing a broken file', () => {
    const csv = toCsv([], meta)
    expect(csv.split('\n').filter(Boolean)).toHaveLength(1) // header only
  })

  it('totals exactly', () => {
    expect(summarise(rows, meta).totalMinor).toBe(1_000_000n)
    expect(summarise([], meta).totalMinor).toBe(0n)
  })
})

describe('report requests', () => {
  const base = { kind: 'PORTFOLIO' as const, format: 'PDF' as const, from: '2026-01', to: '2026-05' }

  it('accepts a valid range', () => {
    expect(generateReportSchema.safeParse(base).success).toBe(true)
  })
  it('rejects a reversed range', () => {
    expect(generateReportSchema.safeParse({ ...base, from: '2026-05', to: '2026-01' }).success).toBe(false)
  })
  it('requires a borrower for a borrower report', () => {
    expect(generateReportSchema.safeParse({ ...base, kind: 'BORROWER' }).success).toBe(false)
  })
})

describe('auth', () => {
  it('takes the OTP as a string, so leading zeros survive', () => {
    expect(verifyOtpSchema.safeParse({ email: 'a@b.co', token: '012345' }).success).toBe(true)
    expect(verifyOtpSchema.safeParse({ email: 'a@b.co', token: 12345 }).success).toBe(false)
    expect(verifyOtpSchema.safeParse({ email: 'a@b.co', token: '12345' }).success).toBe(false)
  })
})

describe('document upload', () => {
  const base = {
    borrowerId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    fileName: 'agreement.pdf', mimeType: 'application/pdf' as const, sizeBytes: 1024,
  }

  it('accepts an allowed type within the size cap', () => {
    expect(requestUploadSchema.safeParse(base).success).toBe(true)
  })
  it('rejects an executable masquerading as a document', () => {
    expect(requestUploadSchema.safeParse({ ...base, mimeType: 'application/x-msdownload' }).success).toBe(false)
  })
  it('rejects a file over the cap', () => {
    expect(requestUploadSchema.safeParse({ ...base, sizeBytes: 50 * 1024 * 1024 }).success).toBe(false)
  })
  it('requires the document to attach to something', () => {
    const { borrowerId: _drop, ...orphan } = base
    expect(requestUploadSchema.safeParse(orphan).success).toBe(false)
  })
  it('requires an idempotency key on confirmation', () => {
    expect(confirmUploadSchema.safeParse({ storagePath: 'docs/a.pdf' }).success).toBe(false)
  })
})
