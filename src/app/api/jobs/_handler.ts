import { NextResponse } from 'next/server'
import { secretMatches } from '@/application/http'

/**
 * Shared shape for every scheduled job endpoint. (Phase 4 §12, Phase 14 §4)
 *
 * Two things about these routes are easy to get wrong and impossible to notice
 * until a job has been silently failing for a week:
 *
 *   1. **Vercel Cron issues GET, not POST.** A handler exporting only POST
 *      answers the scheduler with 405 and the dashboard shows an invocation
 *      that "ran". Both verbs are exported here — GET for the scheduler, POST
 *      for a manual trigger.
 *
 *   2. **The endpoint is a public URL.** Vercel attaches
 *      `Authorization: Bearer $CRON_SECRET` when that variable is set; without
 *      the check, anyone who guesses the path can drive the engines. The
 *      comparison is constant-time and the rejection is generic, so the
 *      response cannot be used to probe how close a guess was.
 */
export type JobSummary = Readonly<Record<string, number | string>>

export function jobRoute(run: () => JobSummary): (request: Request) => NextResponse {
  return function handler(request: Request): NextResponse {
    const provided = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null
    if (!secretMatches(provided, process.env['CRON_SECRET'])) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Not permitted.' } },
        { status: 403 },
      )
    }
    return NextResponse.json({ data: run() }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
