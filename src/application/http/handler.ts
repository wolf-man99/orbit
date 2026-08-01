/**
 * Route handler helpers. (Phase 6 §4)
 *
 * One envelope, one error path. Handlers return domain results; this module
 * turns them into HTTP so no route reinvents the mapping.
 */
import type { DomainError } from '@/domain/errors'
import { statusForError, type ErrorBody, type SuccessBody } from './envelope'

export const requestId = (): string =>
  `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

export function success<T>(data: T, asOf: string, id = requestId()): SuccessBody<T> {
  return { data, meta: { requestId: id, asOf } }
}

export function failure(error: DomainError, id = requestId()): {
  readonly body: ErrorBody
  readonly status: number
} {
  const message =
    error.kind === 'VALIDATION' || error.kind === 'INVARIANT' || error.kind === 'ENGINE'
      ? error.message
      : error.kind === 'NOT_FOUND'
        ? 'Not found.'
        : error.kind === 'FORBIDDEN'
          ? 'Not permitted.'
          : 'This changed while you were away.'

  return {
    status: statusForError(error),
    body: {
      error: {
        code: error.kind,
        message,
        ...(error.kind === 'VALIDATION'
          ? { details: [{ field: error.field, message: error.message }] }
          : {}),
        requestId: id,
      },
    },
  }
}

/**
 * Compares a secret in constant time.
 *
 * A cron endpoint is a public URL, and `===` on a secret leaks its prefix
 * through timing. (Phase 4 §12.2)
 */
export function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < provided.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}
