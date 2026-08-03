'use client'

import { Bell, CircleUser } from 'lucide-react'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import {
  RecordPaymentDialog,
  type LoanOption,
} from '@/features/transactions/components/record-payment-dialog'
import { BottomNav } from './bottom-nav'
import { Sidebar } from './sidebar'

/**
 * Application chrome. (Phase 2 §3.1)
 *
 * Owns the one piece of state the chrome needs — whether the record-payment
 * sheet is open — so the FAB and the sidebar button, which sit in different
 * branches of this tree, can share it. `(app)/layout.tsx` stays a server
 * component and only fetches the loan list the dialog's picker needs.
 */
export function AppChrome({
  loans,
  children,
}: {
  readonly loans: readonly LoanOption[]
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-bg lg:flex">
      <Sidebar onAction={() => setOpen(true)} />

      <div className="min-w-0 flex-1">
        {/* The top bar carries Notifications and Settings on mobile, where the
            bottom bar has no room for them. On desktop the sidebar owns both. */}
        <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl lg:hidden">
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

        <main className="mx-auto max-w-5xl px-4 pb-36 pt-6 lg:pb-12 lg:pt-10">{children}</main>
        <BottomNav onAction={() => setOpen(true)} />
      </div>

      <RecordPaymentDialog open={open} onOpenChange={setOpen} loans={loans} />
    </div>
  )
}
