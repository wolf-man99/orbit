/**
 * Shared primitives for every wire contract. (PRD ENG-03, SEC-06)
 *
 * These schemas are the single source of truth: the client validates against
 * them before sending, the server re-validates on receipt, and both derive
 * their TypeScript types from the same declaration. The server is always
 * authoritative — client validation is an affordance, never a control.
 *
 * Zod lives here rather than in `domain` because `domain` must remain free of
 * npm dependencies so the interest engine stays portable. (Phase 5 §4)
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const uuidSchema = z.uuid()

/** Client-generated, monotonic, and stable across retries. (Phase 4 §9.3) */
export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[0-9A-HJKMNP-TV-Za-z_-]+$/, 'must be a ULID or URL-safe token')

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Amounts cross the wire as decimal STRINGS of minor units, never as JSON
 * numbers.
 *
 * A single amount would in fact survive as a double — 2^53 paise is far above
 * any realistic portfolio. The discipline is kept anyway because `JSON.parse`
 * degrades silently rather than loudly when it is eventually exceeded by a
 * sum or a future currency with more minor units, and because a string can
 * never be accidentally fed to floating-point arithmetic. (PRD M-01)
 */
export const minorSchema = z
  .string()
  .regex(/^-?\d{1,19}$/, 'must be an integer count of minor units')
  .transform((value) => BigInt(value))

/** Non-negative variant, for amounts that are magnitudes rather than deltas. */
export const positiveMinorSchema = minorSchema.refine(
  (value) => value > 0n,
  'must be greater than zero',
)

export const currencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'must be an ISO-4217 code')

/** Interest rate in basis points. 200 = 2%. (PRD M-03) */
export const basisPointsSchema = z.number().int().min(0).max(100_000)

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Calendar date, no time, no zone. Accrual boundaries are calendar facts. */
export const plainDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date (YYYY-MM-DD)')

export const instantSchema = z.iso.datetime({ offset: true })

/** Month bucket, e.g. "2026-03". Always resolved in the user's timezone. */
export const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'must be YYYY-MM')

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Cursor pagination only. Offsets are unusable against an append-only ledger:
 * rows are inserted continuously, so page 2 of an offset query silently skips
 * or repeats rows that shifted between requests. The cursor encodes
 * (occurredAt, seq), which is stable regardless of what was appended since.
 */
export const cursorSchema = z.string().max(256)

export const paginationSchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export type Pagination = z.infer<typeof paginationSchema>

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/** `-field` for descending, `field` for ascending. Single key only in V1. */
export const sortSchema = (fields: readonly [string, ...string[]]) =>
  z
    .string()
    .refine(
      (value) => fields.includes(value.replace(/^-/, '')),
      `must be one of ${fields.join(', ')} optionally prefixed with -`,
    )
