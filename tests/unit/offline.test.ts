import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS, backoffMs, classify } from '@/offline/queue'

/**
 * The queue's decision table is the part that must be right. IndexedDB
 * mechanics are exercised by the E2E run; the classification is what decides
 * whether a recorded payment is kept, retried, or surfaced.
 */
describe('response classification (Phase 4 §10.2)', () => {
  it('drops on 201 Created', () => {
    expect(classify(201)).toBe('DROP')
  })

  it('drops on 200 — a replayed key is SUCCESS, not an error', () => {
    // A timeout after a successful write is indistinguishable from a failure at
    // the client, so retry is inevitable. Treating the replay as an error would
    // report a failure for a payment that was in fact recorded.
    expect(classify(200)).toBe('DROP')
  })

  it('retries on a network error', () => {
    expect(classify('network-error')).toBe('RETRY')
  })

  it('retries on 5xx', () => {
    expect(classify(500)).toBe('RETRY')
    expect(classify(503)).toBe('RETRY')
  })

  it('parks on 4xx, which retrying cannot fix', () => {
    expect(classify(422)).toBe('PARK')
    expect(classify(403)).toBe('PARK')
  })

  it('parks on 409 — same key, different payload is a client bug', () => {
    expect(classify(409)).toBe('PARK')
  })
})

describe('retry policy', () => {
  it('backs off exponentially', () => {
    expect([0, 1, 2, 3, 4].map(backoffMs)).toEqual([2000, 4000, 8000, 16000, 32000])
  })

  it('caps attempts rather than retrying forever', () => {
    // Unbounded retry against a permanent failure hides a real problem from the
    // user; the item is parked for review instead. (Phase 4 §19)
    expect(MAX_ATTEMPTS).toBe(5)
  })
})
