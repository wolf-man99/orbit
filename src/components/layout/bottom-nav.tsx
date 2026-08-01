'use client'

import { BarChart3, LayoutGrid, Users, ArrowLeftRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { Fab } from './fab'

/**
 * Four destinations plus a centred action. (Phase 2 §3.1)
 *
 * Settings and Notifications live in the top bar: Settings is the least-used
 * destination in the product and does not warrant a permanent thumb-reachable
 * slot, and Notifications is a state surface checked when badged rather than a
 * place browsed by choice.
 */
const DESTINATIONS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/borrowers', label: 'Borrowers', icon: Users },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
] as const

export function BottomNav({ onAction }: { readonly onAction?: (() => void) | undefined }) {
  const pathname = usePathname()
  const [left, right] = [DESTINATIONS.slice(0, 2), DESTINATIONS.slice(2)]

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 lg:hidden',
        'border-t border-border bg-surface/85 backdrop-blur-xl',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 items-center">
        {left.map((item) => (
          <NavItem key={item.href} {...item} active={pathname.startsWith(item.href)} />
        ))}
        <li className="flex justify-center">
          <Fab label="Record payment" onClick={onAction} className="-translate-y-3" />
        </li>
        {right.map((item) => (
          <NavItem key={item.href} {...item} active={pathname.startsWith(item.href)} />
        ))}
      </ul>
    </nav>
  )
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
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
          'flex min-h-[44px] flex-col items-center gap-1 py-2 transition-base',
          active ? 'text-accent' : 'text-secondary hover:text-primary',
        )}
      >
        <Icon size={20} aria-hidden />
        <span className="text-caption">{label}</span>
      </Link>
    </li>
  )
}
