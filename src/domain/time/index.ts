/**
 * Calendar primitives.
 *
 * Deliberately date-only and timezone-free. Accrual boundaries are calendar
 * facts, not instants; mixing them with timestamps is how month-end arithmetic
 * goes wrong. Conversion between a user's timezone and these values happens at
 * the application boundary, never inside the engine. (Phase 4 §12)
 *
 * Implementation: Phase 10.
 */

/** ISO-8601 calendar date, e.g. "2026-03-15". No time, no zone. */
export type PlainDate = string & { readonly __brand: 'PlainDate' }

/** IANA identifier, e.g. "Asia/Kolkata". */
export type TimeZone = string & { readonly __brand: 'TimeZone' }
