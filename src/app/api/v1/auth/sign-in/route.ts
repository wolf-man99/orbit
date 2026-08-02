import { NextResponse } from 'next/server'
import { signInSchema } from '@/application/schemas'
import { failure, requestId, success } from '@/application/http'
import { authAdapter, hasAuth } from '@/composition'

/** Requests an email OTP. (PRD S-04, Q41) */
export async function POST(request: Request): Promise<NextResponse> {
  const id = requestId()
  const parsed = signInSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return NextResponse.json(
      failure({ kind: 'VALIDATION', field: 'email', message: 'A valid email is required.' }, id).body,
      { status: 422, headers: { 'X-Request-Id': id } },
    )
  }

  if (!hasAuth()) {
    return NextResponse.json(
      failure({ kind: 'FORBIDDEN', reason: 'auth not configured' }, id).body,
      { status: 503, headers: { 'X-Request-Id': id } },
    )
  }

  try {
    await (await authAdapter()).sendOtp(parsed.data.email)
  } catch {
    // Deliberately indistinguishable from success. Reporting "no such account"
    // would turn this endpoint into an account-existence oracle.
    void 0
  }

  return NextResponse.json(success({ sent: true }, new Date().toISOString(), id), {
    headers: { 'X-Request-Id': id, 'Cache-Control': 'no-store' },
  })
}
