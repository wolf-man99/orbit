import { NextResponse } from 'next/server'
import { secretMatches } from '@/application/http'

/**
 * Nightly reminder generation. (Phase 4 §12, PRD R-01 … R-03, R-09)
 *
 * Idempotent: every candidate carries a dedupeKey matching the unique index on
 * (userId, dedupeKey), so a duplicated or retried run upserts rather than
 * producing a second copy of yesterday's reminder.
 */
export function POST(request: Request): NextResponse {
  const provided = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null
  if (!secretMatches(provided, process.env['CRON_SECRET'])) {
    // Generic: a cron endpoint is a public URL and must not confirm whether a
    // secret was close.
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Not permitted.' } }, { status: 403 })
  }

  // Phase 10 wiring: for each tenant, withTenant → generateReminders(...) →
  // upsert on dedupeKey → record an engine_run row.
  return NextResponse.json({ data: { generated: 0 } }, { headers: { 'Cache-Control': 'no-store' } })
}
