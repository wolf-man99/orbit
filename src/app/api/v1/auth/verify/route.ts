import { NextResponse } from 'next/server'
import { verifyOtpSchema } from '@/application/schemas'
import { failure, requestId, success } from '@/application/http'
import { authAdapter } from '@/composition'

/** Exchanges an OTP for a session. (Q41) */
export async function POST(request: Request): Promise<NextResponse> {
  const id = requestId()
  const parsed = verifyOtpSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return NextResponse.json(
      failure({ kind: 'VALIDATION', field: 'token', message: 'Enter the six-digit code.' }, id).body,
      { status: 422, headers: { 'X-Request-Id': id } },
    )
  }

  try {
    const user = await (await authAdapter()).verifyOtp(parsed.data.email, parsed.data.token)
    // The user id is returned but never accepted as input: identity comes from
    // the session cookie the adapter just set, and nowhere else.
    return NextResponse.json(success({ userId: user.userId }, new Date().toISOString(), id), {
      headers: { 'X-Request-Id': id, 'Cache-Control': 'no-store' },
    })
  } catch {
    // Generic: a specific message would reveal whether the address exists.
    return NextResponse.json(
      failure({ kind: 'FORBIDDEN', reason: 'verification failed' }, id).body,
      { status: 401, headers: { 'X-Request-Id': id } },
    )
  }
}
