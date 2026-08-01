/**
 * Response envelope and error mapping. (Phase 4 §13.1)
 *
 * One shape for every endpoint, so the client has exactly one parser and one
 * error path rather than a per-endpoint guess.
 */
import type { DomainError } from '@/domain/errors'

export interface ResponseMeta {
  /** Correlates a response with server logs and traces. Safe to show a user. */
  readonly requestId: string
  /** When the data was computed. No figure is ever presented undated. (PRD D-16) */
  readonly asOf: string
}

export interface CursorMeta {
  readonly next: string | null
  readonly hasMore: boolean
}

export interface SuccessBody<T> {
  readonly data: T
  readonly meta: ResponseMeta
}

export interface PaginatedBody<T> {
  readonly data: readonly T[]
  readonly meta: ResponseMeta & { readonly cursor: CursorMeta }
}

export interface ErrorBody {
  readonly error: {
    readonly code: ErrorCode
    readonly message: string
    readonly details?: readonly { readonly field: string; readonly message: string }[]
    readonly requestId: string
  }
}

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVARIANT'
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'
  | 'RATE_LIMITED'
  | 'ENGINE'
  | 'INTERNAL'

/**
 * Maps a domain error to its HTTP status.
 *
 * IDEMPOTENT_REPLAY is deliberately absent: it is not an error. A replayed key
 * returns 200 with the original event, because a network timeout after a
 * successful write is indistinguishable from a failure at the client, so retry
 * is inevitable and must be uneventful. (Phase 4 §9.3)
 */
export function statusForError(error: DomainError): number {
  switch (error.kind) {
    case 'VALIDATION':
      return 422
    case 'NOT_FOUND':
      return 404
    case 'CONFLICT':
      return error.reason === 'IDEMPOTENT_REPLAY' ? 200 : 409
    case 'INVARIANT':
      return 422
    case 'FORBIDDEN':
      return 403
    case 'ENGINE':
      return 500
  }
}
