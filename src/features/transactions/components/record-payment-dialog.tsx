'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { fromDecimalString, minorDigitsFor } from '@/domain/money'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, Field, inputClass } from '@/components/ui/dialog'

export interface LoanOption {
  readonly id: string
  readonly label: string
  readonly currency: string
}

/**
 * Record a receipt — the product's most-used action, reachable from the FAB
 * on mobile and the sidebar button on desktop. (Phase 2 §3.3, Phase 6 §8.1)
 *
 * A single call may carry an interest component, a principal component, or
 * both; the server writes each as its own typed ledger event. Client
 * validation mirrors `recordPaymentSchema` exactly, but the server re-checks
 * everything — this form is an affordance, not a control.
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  loans,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly loans: readonly LoanOption[]
}) {
  const router = useRouter()
  const idempotencyKey = useRef(crypto.randomUUID())
  const today = useRef(new Date().toISOString().slice(0, 10))

  const [loanId, setLoanId] = useState(loans[0]?.id ?? '')
  const [occurredOn, setOccurredOn] = useState(today.current)
  const [interest, setInterest] = useState('')
  const [principal, setPrincipal] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // A fresh idempotency key per dialog session — retries within one attempt
  // reuse it, so a timeout-then-retry cannot double-post, but the next
  // payment the user opens the sheet for is a genuinely new command.
  useEffect(() => {
    if (open) {
      idempotencyKey.current = crypto.randomUUID()
      setError(null)
    }
  }, [open])

  const selectedCurrency = loans.find((loan) => loan.id === loanId)?.currency ?? 'INR'
  const digits = minorDigitsFor(selectedCurrency)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)

    if (!loanId) {
      setError('Choose a loan.')
      return
    }

    let interestMinor: bigint | undefined
    let principalMinor: bigint | undefined
    try {
      if (interest.trim()) interestMinor = fromDecimalString(interest, digits)
      if (principal.trim()) principalMinor = fromDecimalString(principal, digits)
    } catch {
      setError(`Enter amounts as decimals with at most ${String(digits)} places.`)
      return
    }
    if (interestMinor === undefined && principalMinor === undefined) {
      setError('Enter an interest amount, a principal amount, or both.')
      return
    }
    if ((interestMinor !== undefined && interestMinor <= 0n) ||
        (principalMinor !== undefined && principalMinor <= 0n)) {
      setError('Amounts must be greater than zero.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/v1/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          loanId,
          occurredOn,
          ...(interestMinor === undefined ? {} : { interestMinor: interestMinor.toString() }),
          ...(principalMinor === undefined ? {} : { principalMinor: principalMinor.toString() }),
          ...(note.trim() ? { note: note.trim() } : {}),
          idempotencyKey: idempotencyKey.current,
        }),
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          body && typeof body === 'object' && 'error' in body &&
          body.error && typeof body.error === 'object' && 'message' in body.error &&
          typeof body.error.message === 'string'
            ? body.error.message
            : 'The payment could not be recorded.'
        setError(message)
        return
      }

      setInterest('')
      setPrincipal('')
      setNote('')
      onOpenChange(false)
      router.refresh()
    } catch {
      setError('Could not reach the server. Nothing was saved — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record payment" description="Interest, principal, or both — for one loan.">
        {loans.length === 0 ? (
          <p className="text-body text-secondary">
            No loans yet. Add a borrower and a loan before recording a payment.
          </p>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <Field label="Loan" htmlFor="rp-loan">
              <select
                id="rp-loan"
                className={inputClass}
                value={loanId}
                onChange={(e) => setLoanId(e.target.value)}
              >
                {loans.map((loan) => (
                  <option key={loan.id} value={loan.id}>{loan.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Date" htmlFor="rp-date">
              <input
                id="rp-date"
                type="date"
                className={inputClass}
                value={occurredOn}
                max={today.current}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={`Interest (${selectedCurrency})`} htmlFor="rp-interest">
                <input
                  id="rp-interest"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={inputClass}
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                />
              </Field>
              <Field label={`Principal (${selectedCurrency})`} htmlFor="rp-principal">
                <input
                  id="rp-principal"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={inputClass}
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Note (optional)" htmlFor="rp-note">
              <textarea
                id="rp-note"
                rows={2}
                className="w-full rounded-input border border-border-interactive bg-bg px-3 py-2 text-body text-primary transition-base placeholder:text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/30"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            {error ? <p role="alert" className="text-label text-danger">{error}</p> : null}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Recording…' : 'Record payment'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
