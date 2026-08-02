/**
 * Auth adapters.
 *
 * Types live in `./types` rather than here so the Supabase implementation can
 * import them without depending on this barrel — which re-exports the
 * implementation, and therefore formed an import cycle. The boundary checker
 * caught it as `no-circular`.
 */
export type { AuthAdapter, SessionUser } from './types'
export { contextFor } from './types'
export type { CookieStore } from './supabase'
export { supabaseAuth } from './supabase'
