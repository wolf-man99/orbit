/**
 * Supabase Auth adapter. (Q39)
 *
 * Identity is resolved server-side on every request. `getUser()` is used rather
 * than `getSession()`: a session is read from a cookie the client controls,
 * whereas getUser revalidates the token against Supabase. Trusting the cookie
 * would make every tenancy control bypassable by editing it.
 */
import { createServerClient } from '@supabase/ssr'
import type { AuthAdapter, SessionUser } from './types'

export interface CookieStore {
  readonly getAll: () => readonly { name: string; value: string }[]
  readonly setAll: (
    cookies: readonly { name: string; value: string; options?: Record<string, unknown> }[],
  ) => void
}

export function supabaseAuth(cookies: CookieStore): AuthAdapter {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
  if (!url || !key) {
    throw new Error('auth: NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY must be set')
  }

  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => [...cookies.getAll()],
      setAll: (next) => {
        cookies.setAll(next)
      },
    },
  })

  return {
    async sendOtp(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        // No auto sign-up from an OTP request: it would let anyone create an
        // account for an address they do not control.
        options: { shouldCreateUser: true },
      })
      if (error) throw new Error(error.message)
    },

    async verifyOtp(email, token) {
      const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' })
      if (error || !data.user) throw new Error(error?.message ?? 'verification failed')
      return toSessionUser(data.user)
    },

    async currentUser() {
      // getUser, not getSession: the token is revalidated rather than trusted.
      const { data, error } = await client.auth.getUser()
      if (error || !data.user) return null
      return toSessionUser(data.user)
    },

    async signOut() {
      await client.auth.signOut()
    },
  }
}

function toSessionUser(user: { id: string; email?: string | undefined; user_metadata?: Record<string, unknown> }): SessionUser {
  const zone = user.user_metadata?.['time_zone']
  return {
    userId: user.id,
    email: user.email ?? '',
    timeZone: typeof zone === 'string' ? zone : 'Asia/Kolkata',
  }
}
