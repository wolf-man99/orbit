import { NextResponse } from 'next/server'
import { requestId, success } from '@/application/http'
import { authAdapter, hasAuth } from '@/composition'

export async function POST(): Promise<NextResponse> {
  const id = requestId()
  if (hasAuth()) await (await authAdapter()).signOut()
  return NextResponse.json(success({ signedOut: true }, new Date().toISOString(), id), {
    headers: { 'X-Request-Id': id, 'Cache-Control': 'no-store' },
  })
}
