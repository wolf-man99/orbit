/**
 * Report generation. (PRD RP-01 … RP-06)
 *
 * Pure: rows in, serialised bytes out. Deterministic and testable without a
 * filesystem, a browser, or a PDF engine.
 */
import { toDecimalString, type Minor } from '@/domain/money'
import type { PlainDate } from '@/domain/time'

export interface ReportRow {
  readonly occurredOn: PlainDate
  readonly borrower: string
  readonly type: string
  readonly amount: Minor
  readonly note?: string | undefined
}

export interface ReportMeta {
  readonly title: string
  readonly generatedAt: string
  /** Every report footer carries this, so an old statement stays explainable. (RP-06) */
  readonly engineVersion: string
  readonly currency: string
}

/**
 * Escapes a CSV field.
 *
 * A leading =, +, -, or @ is prefixed with a quote. Spreadsheet software treats
 * such a value as a FORMULA, so an unescaped borrower note could execute on
 * open — CSV injection. A financial export is precisely the file a user opens
 * without thinking.
 */
export function csvField(value: string): string {
  const dangerous = /^[=+\-@\t\r]/.test(value)
  const escaped = value.replace(/"/g, '""')
  const needsQuotes = dangerous || /[",\n\r]/.test(value)
  const body = dangerous ? `'${escaped}` : escaped
  return needsQuotes ? `"${body}"` : body
}

export function toCsv(rows: readonly ReportRow[], meta: ReportMeta, minorDigits = 2): string {
  const header = ['Date', 'Borrower', 'Type', `Amount (${meta.currency})`, 'Note']
  const lines = [
    header.map(csvField).join(','),
    ...rows.map((row) =>
      [
        row.occurredOn,
        row.borrower,
        row.type,
        // The exact decimal, never a formatted or grouped figure: a spreadsheet
        // must receive a number it can compute with.
        toDecimalString(row.amount, minorDigits),
        row.note ?? '',
      ]
        .map(csvField)
        .join(','),
    ),
  ]
  // A trailing newline: some tools drop the final row without one.
  return `${lines.join('\n')}\n`
}

export interface ReportSummary {
  readonly rows: number
  readonly totalMinor: Minor
  readonly meta: ReportMeta
}

export function summarise(rows: readonly ReportRow[], meta: ReportMeta): ReportSummary {
  return {
    rows: rows.length,
    totalMinor: rows.reduce<Minor>((total, row) => (total + row.amount) as Minor, 0n as Minor),
    meta,
  }
}
