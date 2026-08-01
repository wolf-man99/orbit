import { describe, expect, it } from 'vitest'
import { failure, secretMatches, statusForError, success } from '@/application/http'

describe('response envelope', () => {
  it('dates every success response', () => {
    const body = success({ ok: 1 }, '2026-05-20T10:00:00+05:30', 'req_1')
    expect(body.meta.asOf).toBe('2026-05-20T10:00:00+05:30')
    expect(body.meta.requestId).toBe('req_1')
  })
})

describe('error mapping (Phase 6 §4.1)', () => {
  it('treats an idempotent replay as success, not an error', () => {
    expect(statusForError({ kind: 'CONFLICT', reason: 'IDEMPOTENT_REPLAY' })).toBe(200)
  })

  it('uses 409 only for a genuine state change', () => {
    expect(statusForError({ kind: 'CONFLICT', reason: 'STATE_CHANGED' })).toBe(409)
  })

  it('maps validation and invariant failures to 422', () => {
    expect(statusForError({ kind: 'VALIDATION', field: 'x', message: 'm' })).toBe(422)
    expect(statusForError({ kind: 'INVARIANT', constraint: 'c', message: 'm' })).toBe(422)
  })

  it('never leaks whether a row exists in another tenant', () => {
    const { body } = failure({ kind: 'NOT_FOUND', entity: 'borrower', id: 'secret-id' })
    expect(JSON.stringify(body)).not.toContain('secret-id')
    expect(body.error.message).toBe('Not found.')
  })

  it('never echoes a forbidden reason back to the caller', () => {
    const { body } = failure({ kind: 'FORBIDDEN', reason: 'belongs to user 42' })
    expect(JSON.stringify(body)).not.toContain('42')
  })

  it('surfaces field-level detail for validation failures', () => {
    const { body } = failure({ kind: 'VALIDATION', field: 'interestMinor', message: 'required' })
    expect(body.error.details?.[0]).toEqual({ field: 'interestMinor', message: 'required' })
  })
})

describe('cron secret comparison (Phase 4 §12.2)', () => {
  it('accepts the exact secret', () => {
    expect(secretMatches('s3cret-value', 's3cret-value')).toBe(true)
  })
  it('rejects a wrong secret of the same length', () => {
    expect(secretMatches('s3cret-valuf', 's3cret-value')).toBe(false)
  })
  it('rejects a matching prefix', () => {
    expect(secretMatches('s3cret', 's3cret-value')).toBe(false)
  })
  it('rejects a missing header or unset secret', () => {
    expect(secretMatches(null, 's3cret')).toBe(false)
    expect(secretMatches('s3cret', undefined)).toBe(false)
  })
})
