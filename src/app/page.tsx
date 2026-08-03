import { redirect } from 'next/navigation'

/**
 * The root route has no content of its own — Orbit opens on the dashboard.
 * Sign-in has no screen yet (Q45), so this matches the fallback the rest of
 * the app already uses: unauthenticated reads resolve against the demo
 * identity rather than gating on a login the UI cannot yet present.
 */
export default function RootPage(): never {
  redirect('/dashboard')
}
