import { describe, expect, it, vi } from 'vitest'
import { minor } from '@/domain/money'
import {
  postingsFor, recordPayment,
  type PaymentPlan, type RecordPaymentPorts,
} from '@/application/services/record-payment'

const ports = (over: Partial<RecordPaymentPorts> = {}): RecordPaymentPorts => ({
  findByIdempotencyKey: vi.fn().mockResolvedValue(null),
  unsettledPeriods: vi.fn().mockResolvedValue([
    { id: 'c1', cycleIndex: 1, accrued: minor(1_000_000n), alreadySettled: minor(0n) },
    { id: 'c2', cycleIndex: 2, accrued: minor(1_000_000n), alreadySettled: minor(0n) },
  ]),
  writePayment: vi.fn().mockImplementation((plan: PaymentPlan) =>
    Promise.resolve({
      eventIds: ['e1'], groupId: plan.groupId,
      settledPeriodIds: plan.allocations.map((a) => a.periodId),
    })),
  ...over,
})

const command = {
  loanId: 'loan-1', occurredOn: '2026-04-14', idempotencyKey: 'key-1', groupId: 'grp-1',
}

describe('recordPayment', () => {
  it('rejects a payment carrying no money', async () => {
    const result = await recordPayment(command, ports())
    expect(result).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } })
  })

  it('allocates interest oldest-first when no override is given', async () => {
    const p = ports()
    const result = await recordPayment({ ...command, interestMinor: minor(1_500_000n) }, p)
    expect(result.ok).toBe(true)
    expect(p.writePayment).toHaveBeenCalledWith(expect.objectContaining({
      allocations: [
        { periodId: 'c1', amount: 1_000_000n },
        { periodId: 'c2', amount: 500_000n },
      ],
    }))
  })

  it('honours an explicit allocation override', async () => {
    const p = ports()
    await recordPayment({
      ...command, interestMinor: minor(500_000n),
      allocations: [{ periodId: 'c2', amount: minor(500_000n) }],
    }, p)
    expect(p.unsettledPeriods).not.toHaveBeenCalled()
    expect(p.writePayment).toHaveBeenCalledWith(expect.objectContaining({
      allocations: [{ periodId: 'c2', amount: 500_000n }],
    }))
  })

  it('does not allocate a principal-only receipt to accrual cycles', async () => {
    const p = ports()
    await recordPayment({ ...command, principalMinor: minor(5_000_000n) }, p)
    expect(p.unsettledPeriods).not.toHaveBeenCalled()
    expect(p.writePayment).toHaveBeenCalledWith(expect.objectContaining({ allocations: [] }))
  })

  it('treats a replayed key as success, never as an error', async () => {
    const p = ports({
      findByIdempotencyKey: vi.fn().mockResolvedValue({ id: 'existing', groupId: 'grp-0' }),
    })
    const result = await recordPayment({ ...command, interestMinor: minor(1n) }, p)
    expect(result).toMatchObject({ ok: true, value: { kind: 'REPLAYED', eventId: 'existing' } })
    // Critically: it must not write again.
    expect(p.writePayment).not.toHaveBeenCalled()
  })
})

describe('postings', () => {
  const plan = (interest: bigint, principal: bigint): PaymentPlan => ({
    loanId: 'l', occurredOn: '2026-04-14', groupId: 'g',
    interestMinor: minor(interest), principalMinor: minor(principal),
    allocations: [], idempotencyKey: 'k',
  })

  it('writes one event for an interest-only receipt', () => {
    const postings = postingsFor(plan(1_000_000n, 0n))
    expect(postings).toHaveLength(1)
    expect(postings[0]).toMatchObject({
      type: 'INTEREST_RECEIVED',
      interestDeltaMinor: -1_000_000n,
      cashDeltaMinor: 1_000_000n,
      taxCategory: 'INTEREST_INCOME',
    })
  })

  it('writes TWO events for a split receipt, with different tax categories', () => {
    const postings = postingsFor(plan(1_000_000n, 500_000n))
    expect(postings).toHaveLength(2)
    expect(postings.map((p) => p.taxCategory)).toEqual(['INTEREST_INCOME', 'PRINCIPAL_MOVEMENT'])
  })

  it('posts deltas that reduce what is owed and increase cash', () => {
    for (const posting of postingsFor(plan(1_000_000n, 500_000n))) {
      expect(posting.cashDeltaMinor).toBeGreaterThan(0n)
      expect(posting.interestDeltaMinor + posting.principalDeltaMinor).toBeLessThan(0n)
      // The database CHECK constraint requires amount = |delta|.
      expect(posting.amountMinor).toBe(-(posting.interestDeltaMinor + posting.principalDeltaMinor))
    }
  })
})
