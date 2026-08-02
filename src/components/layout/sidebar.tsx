'use client'

import {
  ArrowLeftRight, BarChart3, Bell, FileText, LayoutGrid, Plus, Settings, Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { haptic } from '@/components/motion/primitives'

/**
 * Desktop navigation. (Phase 2 §3.2)
 *
 * Carries the same information architecture as the mobile bottom bar, with the
 * secondary group that the bar has no room for. The FAB becomes a labelled
 * primary button pinned to the head — on a pointer device a floating circle is
 * harder to hit than a button with a word in it, and there is space for the word.
 */
const PRIMARY = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/borrowers', label: 'Borrowers', icon: Users },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
] as const

const SECONDARY = [
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

export function Sidebar({ onAction }: { readonly onAction?: (() => void) | undefined }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="hidden lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-border lg:p-4"
    >
      <Link href="/dashboard" className="px-2 pt-2 text-label font-semibold tracking-tight">
        Orbit
      </Link>

      <button
        type="button"
        onClick={() => {
          haptic('commit')
          onAction?.()
        }}
        className={cn(
          'flex h-11 items-center justify-center gap-2 rounded-button',
          'bg-accent-fill text-accent-on-fill text-body font-medium',
          'transition-base hover:opacity-90 active:opacity-80',
        )}
      >
        <Plus size={18} aria-hidden />
        Record payment
      </button>

      <ul className="flex flex-col gap-1">
        {PRIMARY.map((item) => (
          <SidebarItem key={item.href} {...item} active={pathname.startsWith(item.href)} />
        ))}
      </ul>

      <ul className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
        {SECONDARY.map((item) => (
          <SidebarItem key={item.href} {...item} active={pathname.startsWith(item.href)} />
        ))}
      </ul>
    </nav>
  )
}

function SidebarItem({
  href, label, icon: Icon, active,
}: {
  readonly href: string
  readonly label: string
  readonly icon: typeof LayoutGrid
  readonly active: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-[44px] items-center gap-3 rounded-sm px-3 text-body transition-base',
          active
            ? 'bg-surface-elevated text-primary'
            : 'text-secondary hover:bg-surface-elevated hover:text-primary',
        )}
      >
        <Icon size={18} aria-hidden />
        {label}
      </Link>
    </li>
  )
}
