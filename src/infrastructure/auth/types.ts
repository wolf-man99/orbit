/**
 * Supabase Auth adapter. (PRD SEC-01, SEC-02)
 *
 * Session identity is resolved SERVER-SIDE on every request. A client-supplied
 * user id is never trusted: an endpoint that accepted one would make every
 * tenancy control in Phases 3 and 4 bypassable by editing a JSON body.
 */
import type { RequestContext } from '@/application/queries/ports'

export interface SessionUser {
  readonly userId: string
  readonly email: string
  readonly timeZone: string
}

export interface AuthAdapter {
  readonly sendOtp: (email: string) => Promise<void>
  readonly verifyOtp: (email: string, token: string) => Promise<SessionUser>
  /** Null when unauthenticated. Never throws — callers redirect. */
  readonly currentUser: () => Promise<SessionUser | null>
  readonly signOut: () => Promise<void>
}

/**
 * Builds the request context from a verified session.
 *
 * `now` is captured once per request rather than read repeatedly, so every
 * figure on a page shares one `asOf` and a request rendered across a midnight
 * boundary cannot report two different days.
 */
export function contextFor(user: SessionUser, portfolioId: string): RequestContext {
  return {
    userId: user.userId,
    portfolioId,
    timeZone: user.timeZone,
    now: new Date(),
  }
}
