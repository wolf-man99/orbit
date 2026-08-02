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

// ---------------------------------------------------------------------------
// SpreadsheetML (XLSX-compatible) and PDF
// ---------------------------------------------------------------------------

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/**
 * SpreadsheetML 2003 — a single XML file Excel, Numbers, and LibreOffice all
 * open natively.
 *
 * Chosen over a real .xlsx because that is a ZIP container needing a library,
 * and this needs none: no dependency to audit, no binary to get wrong, and
 * amounts stay typed as numbers rather than text.
 *
 * Note there is no formula-injection escaping here, unlike CSV. Every cell
 * declares its type, so a value is never reinterpreted as a formula.
 */
export function toSpreadsheetXml(
  rows: readonly ReportRow[],
  meta: ReportMeta,
  minorDigits = 2,
): string {
  const header = ['Date', 'Borrower', 'Type', `Amount (${meta.currency})`, 'Note']
  const cell = (value: string, type: 'String' | 'Number' = 'String') =>
    `<Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`

  const body = rows
    .map(
      (row) =>
        `<Row>${cell(row.occurredOn)}${cell(row.borrower)}${cell(row.type)}` +
        `${cell(toDecimalString(row.amount, minorDigits), 'Number')}` +
        `${cell(row.note ?? '')}</Row>`,
    )
    .join('')

  return (
    `<?xml version="1.0"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Worksheet ss:Name="${xmlEscape(meta.title).slice(0, 31)}"><Table>` +
    `<Row>${header.map((h) => cell(h)).join('')}</Row>` +
    body +
    `</Table></Worksheet></Workbook>`
  )
}

const pdfEscape = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

/**
 * A minimal, valid single-page PDF.
 *
 * Written directly rather than via a rendering engine: a statement is a table
 * of numbers, and a headless browser is a large dependency and a large attack
 * surface for that. Deterministic output also means two runs of the same report
 * are byte-identical, which matters when a user compares statements.
 *
 * Limited to what fits one page; multi-page and richer layout are a later
 * increment. Returns bytes, so the caller decides how to serve them.
 */
export function toPdf(rows: readonly ReportRow[], meta: ReportMeta, minorDigits = 2): Uint8Array {
  const lines: string[] = [
    meta.title,
    '',
    ...rows
      .slice(0, 40)
      .map(
        (row) =>
          `${row.occurredOn}   ${row.borrower.slice(0, 22).padEnd(24)}` +
          `${row.type.slice(0, 18).padEnd(20)}${toDecimalString(row.amount, minorDigits)}`,
      ),
    '',
    // Every report footer carries the engine version, so an old statement stays
    // explainable after the engine evolves. (PRD RP-06, E-14)
    `Generated ${meta.generatedAt} · engine ${meta.engineVersion}`,
  ]

  const content =
    `BT /F1 9 Tf 12 TL 40 780 Td\n` +
    lines.map((line) => `(${pdfEscape(line)}) Tj T*`).join('\n') +
    `\nET`

  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`,
    `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length)
    pdf += `${String(index + 1)} 0 obj\n${object}\nendobj\n`
  }

  const xrefStart = pdf.length
  pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`
  }
  pdf +=
    `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\n` +
    `startxref\n${String(xrefStart)}\n%%EOF`

  return new TextEncoder().encode(pdf)
}
