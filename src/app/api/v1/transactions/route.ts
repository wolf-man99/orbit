import { NextResponse } from 'next/server'
import { recordPaymentSchema } from '@/application/schemas'
import { failure, requestId, success } from '@/application/http'

/**
 * Record a receipt. (Phase 6 §8.1)
 *
 * A versioned route handler with a plain JSON body, deliberately NOT a Server
 * Action: a Server Action is an opaque POST keyed to a build-specific action
 * id, so the offline service worker cannot construct one and a mutation queued
 * before a deploy would reference an id that no longer exists after it.
 * (Phase 4 §9.1)
 */
export async function POST(request: Request): Promise<NextResponse> {
  const id = requestId()
  const body: unknown = await request.json().catch(() => null)

  const parsed = recordPaymentSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      failure(
        { kind: 'VALIDATION', field: first?.path.join('.') ?? 'body', message: first?.message ?? 'Invalid request.' },
        id,
      ).body,
      { status: 422, headers: { 'X-Request-Id': id } },
    )
  }

  // Phase 10 wiring: resolve the session, then
  //   withTenant(userId, (db) => recordPayment(command, ports(db, tenant)))
  // The response carries events, balance, settled cycles, and resolved
  // reminders so the client reconciles in one round trip. (Phase 6 §8.1)
  return NextResponse.json(
    success({ accepted: true, loanId: parsed.data.loanId }, new Date().toISOString(), id),
    { status: 202, headers: { 'X-Request-Id': id, 'Cache-Control': 'no-store' } },
  )
}
