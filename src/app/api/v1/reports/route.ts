import { NextResponse } from 'next/server'
import { minorDigitsFor } from '@/domain/money'
import { addMonths, plainDate } from '@/domain/time'
import { generateReportSchema } from '@/application/schemas'
import { failure, requestId } from '@/application/http'
import { summarise, toCsv, toPdf, toSpreadsheetXml, type ReportRow } from '@/application/services/reports'
import { ledgerTypeLabel } from '@/application/queries/views'
import { portfolioSource, requestContext } from '@/composition'

/**
 * Generate a report. (Phase 6 §8, PRD RP-01 … RP-06)
 *
 * Phase 6 specced this as `POST /reports` to start a job plus `GET /reports/:id`
 * to poll — appropriate for a queue that does not exist yet (Q43: job
 * endpoints are stubs, the engines behind them untriggered). `toCsv` /
 * `toSpreadsheetXml` / `toPdf` are pure, synchronous, and already capped for
 * a single response — nothing here does the async work polling exists to
 * hide — so this returns the file directly. The two-endpoint design is worth
 * building once a report can be slow enough to need it.
 */
const FILE = {
  CSV: { contentType: 'text/csv; charset=utf-8', extension: 'csv' },
  XLSX: { contentType: 'application/vnd.ms-excel', extension: 'xls' },
  PDF: { contentType: 'application/pdf', extension: 'pdf' },
} as const

export async function POST(request: Request): Promise<NextResponse> {
  const id = requestId()

  const context = await requestContext()
  if (!context) {
    return NextResponse.json(
      failure({ kind: 'FORBIDDEN', reason: 'unauthenticated' }, id).body,
      { status: 401, headers: { 'X-Request-Id': id } },
    )
  }

  const parsed = generateReportSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json(
      failure(
        { kind: 'VALIDATION', field: issue?.path.join('.') ?? 'body', message: issue?.message ?? 'Invalid request.' },
        id,
      ).body,
      { status: 422, headers: { 'X-Request-Id': id } },
    )
  }

  const { kind, format, from, to, borrowerId } = parsed.data
  const source = portfolioSource(context)
  const [ledger, settings] = await Promise.all([source.ledger(), source.settings()])

  // Half-open range in calendar terms, not a `date_trunc` boundary — the same
  // trap noted in Phase 14 §4 for cron, applied to a report instead of a job.
  const startsOn = plainDate(`${from}-01`)
  const endsBefore = addMonths(plainDate(`${to}-01`), 1)

  const inRange = ledger.filter(
    (entry) => entry.occurredOn >= startsOn && entry.occurredOn < endsBefore,
  )
  const scoped = kind === 'BORROWER' && borrowerId
    ? inRange.filter((entry) => entry.borrowerId === borrowerId)
    : kind === 'CASH_FLOW'
      ? inRange.filter((entry) => entry.type !== 'LOAN_DISBURSED')
      : inRange

  const rows: ReportRow[] = scoped.map((entry) => ({
    occurredOn: entry.occurredOn,
    borrower: entry.borrowerName,
    type: ledgerTypeLabel(entry.type),
    amount: entry.amount,
    ...(entry.note === undefined ? {} : { note: entry.note }),
  }))

  const meta = {
    title: `Orbit — ${kind.charAt(0)}${kind.slice(1).toLowerCase()} report, ${from} to ${to}`,
    generatedAt: new Date().toISOString(),
    engineVersion: '1.0.0',
    currency: settings.currency,
  }
  const digits = minorDigitsFor(settings.currency)
  const { rows: rowCount, totalMinor } = summarise(rows, meta)

  const { contentType, extension } = FILE[format]
  const body =
    format === 'CSV' ? toCsv(rows, meta, digits)
    : format === 'XLSX' ? toSpreadsheetXml(rows, meta, digits)
    : toPdf(rows, meta, digits)

  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      'X-Request-Id': id,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="orbit-${kind.toLowerCase()}-${from}-to-${to}.${extension}"`,
      'Cache-Control': 'no-store',
      'X-Report-Rows': String(rowCount),
      'X-Report-Total-Minor': totalMinor.toString(),
    },
  })
}
