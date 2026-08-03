'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, inputClass } from '@/components/ui/dialog'

export interface BorrowerOption {
  readonly id: string
  readonly name: string
}

const KINDS = [
  { value: 'PORTFOLIO', label: 'Portfolio — every event' },
  { value: 'CASH_FLOW', label: 'Cash flow — receipts only' },
  { value: 'BORROWER', label: 'Borrower — one relationship' },
] as const

const FORMATS = [
  { value: 'CSV', label: 'CSV' },
  { value: 'XLSX', label: 'Spreadsheet' },
  { value: 'PDF', label: 'PDF' },
] as const

/** Generates and downloads a statement. (Phase 6 §8, PRD RP-01 … RP-06) */
export function ReportForm({ borrowers }: { readonly borrowers: readonly BorrowerOption[] }) {
  const thisMonth = new Date().toISOString().slice(0, 7)

  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('PORTFOLIO')
  const [format, setFormat] = useState<(typeof FORMATS)[number]['value']>('CSV')
  const [from, setFrom] = useState(thisMonth)
  const [to, setTo] = useState(thisMonth)
  const [borrowerId, setBorrowerId] = useState(borrowers[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  async function handleGenerate(): Promise<void> {
    setError(null)
    if (kind === 'BORROWER' && !borrowerId) {
      setError('Choose a borrower.')
      return
    }
    if (from > to) {
      setError('The range must start before it ends.')
      return
    }

    setGenerating(true)
    try {
      const response = await fetch('/api/v1/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind, format, from, to,
          ...(kind === 'BORROWER' ? { borrowerId } : {}),
        }),
      })
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        const message =
          body && typeof body === 'object' && 'error' in body &&
          body.error && typeof body.error === 'object' && 'message' in body.error &&
          typeof body.error.message === 'string'
            ? body.error.message
            : 'The report could not be generated.'
        setError(message)
        return
      }

      // The server names the file via Content-Disposition; the client's job is
      // only to hand the bytes to the browser's download flow.
      const disposition = response.headers.get('content-disposition') ?? ''
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `orbit-report.${format.toLowerCase()}`
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Report" htmlFor="report-kind">
        <select
          id="report-kind"
          className={inputClass}
          value={kind}
          onChange={(e) => setKind(e.target.value as (typeof KINDS)[number]['value'])}
        >
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </Field>

      {kind === 'BORROWER' ? (
        <Field label="Borrower" htmlFor="report-borrower">
          <select
            id="report-borrower"
            className={inputClass}
            value={borrowerId}
            onChange={(e) => setBorrowerId(e.target.value)}
          >
            {borrowers.length === 0
              ? <option value="">No borrowers yet</option>
              : borrowers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="report-from">
          <input id="report-from" type="month" className={inputClass} value={from}
            max={thisMonth} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="report-to">
          <input id="report-to" type="month" className={inputClass} value={to}
            max={thisMonth} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      <Field label="Format" htmlFor="report-format">
        <select
          id="report-format"
          className={inputClass}
          value={format}
          onChange={(e) => setFormat(e.target.value as (typeof FORMATS)[number]['value'])}
        >
          {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </Field>

      {error ? <p role="alert" className="text-label text-danger">{error}</p> : null}

      <Button type="button" variant="primary" full onClick={() => void handleGenerate()} disabled={generating}>
        {generating ? 'Generating…' : 'Generate and download'}
      </Button>
    </div>
  )
}
