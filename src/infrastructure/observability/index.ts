/**
 * Structured logging. (PRD SEC-07, Phase 4 §15)
 *
 * Borrower names, phone numbers, amounts, and notes NEVER reach a log. The
 * redaction happens here, at the logger, rather than at each call site —
 * relying on every caller to remember is how leaks happen, and a leaked log is
 * not revocable.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Keys whose VALUES are dropped wherever they appear, at any depth. */
const REDACT_KEYS = new Set([
  'fullname', 'name', 'borrowername', 'phone', 'email', 'address',
  'idreference', 'note', 'reason', 'body', 'title',
  'amount', 'amountminor', 'principalminor', 'interestminor',
  'outstandingprincipal', 'accrued', 'settled', 'password', 'token',
  'authorization', 'cookie', 'idempotencykey',
])

/** Identifiers are safe and necessary for correlation; values are not. */
const ALLOW_KEYS = new Set([
  'userid', 'portfolioid', 'borrowerid', 'loanid', 'eventid', 'periodid',
  'requestid', 'traceid', 'route', 'method', 'status', 'durationms',
  'outcome', 'kind', 'type', 'count', 'engineversion', 'attempt',
])

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]'
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return '[redacted]'
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase()
    if (REDACT_KEYS.has(lower)) {
      out[key] = '[redacted]'
    } else if (ALLOW_KEYS.has(lower) || typeof entry === 'object') {
      out[key] = redact(entry, depth + 1)
    } else {
      // Default-deny: an unrecognised key is redacted rather than logged.
      // A new field on an entity must be opted IN, so adding a column can
      // never silently start leaking it.
      out[key] = '[redacted]'
    }
  }
  return out
}

export interface LogFields {
  readonly requestId?: string
  readonly userId?: string
  readonly route?: string
  readonly durationMs?: number
  readonly outcome?: string
  readonly [key: string]: unknown
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(redact(fields) as Record<string, unknown>),
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.warn(line)
}

export const logger = {
  debug: (message: string, fields?: LogFields) => {
    if (process.env['NODE_ENV'] === 'development') emit('debug', message, fields)
  },
  info: (message: string, fields?: LogFields) => {
    emit('info', message, fields)
  },
  warn: (message: string, fields?: LogFields) => {
    emit('warn', message, fields)
  },
  error: (message: string, fields?: LogFields) => {
    emit('error', message, fields)
  },
}

/**
 * Conditions that mean the ledger's guarantees are under stress rather than
 * ordinary noise, and should page rather than accumulate. (Phase 4 §15)
 */
export const ALERT_CONDITIONS = [
  'an INVARIANT error reached production',
  'a parked offline mutation is older than 24 hours',
  'loan_balance.last_event_seq lags max(ledger_event.seq) for any loan',
] as const
