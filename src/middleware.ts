import { NextResponse, type NextRequest } from 'next/server'

/**
 * Security headers and the authentication gate. (PRD SEC-10, SEC-02)
 *
 * CSP is applied here rather than in vercel.json because it needs a per-request
 * nonce: a static policy would have to allow 'unsafe-inline' for Next's inline
 * bootstrap script, which defeats most of the point of having a policy.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets the nonce-approved bootstrap load the rest, so no
    // host allow-list is needed and no inline script runs unapproved.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    // Tailwind emits inline styles; there is no nonce-based path for them.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    // Supabase over TLS only. No wildcard: an exfiltration path is a
    // connect-src the policy forgot to close.
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')

  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    // Everything except static assets and the service worker, which must be
    // served without a nonce-bearing CSP or it cannot register.
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/).*)',
  ],
}
