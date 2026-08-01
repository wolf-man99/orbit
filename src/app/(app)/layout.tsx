import { Bell, CircleUser } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { BottomNav } from '@/components/layout'

/**
 * Application chrome. (Phase 2 §3.1)
 *
 * Four destinations plus a centred action in the bottom bar; Settings and
 * Notifications live in the top bar because Settings is the least-used
 * destination in the product and Notifications is a state surface checked when
 * badged, not a place browsed by choice.
 */
export default function AppLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/dashboard" className="text-label font-semibold tracking-tight">
            Orbit
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/notifications" aria-label="Notifications"
              className="relative flex size-11 items-center justify-center rounded-pill text-secondary transition-base hover:text-primary">
              <Bell size={18} aria-hidden />
              <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-pill bg-accent" />
            </Link>
            <Link href="/settings" aria-label="Settings"
              className="flex size-11 items-center justify-center rounded-pill text-secondary transition-base hover:text-primary">
              <CircleUser size={18} aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-36 pt-6 lg:pb-12">{children}</main>
      <BottomNav />
    </div>
  )
}
