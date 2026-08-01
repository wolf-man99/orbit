'use client'

import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { haptic } from '@/components/motion/primitives'

/**
 * The floating action button. (Phase 2 §3.3)
 *
 * It sits in the CENTRE of the bottom bar because it carries the product's
 * highest-frequency action — recording a payment — and the centre is the most
 * thumb-reachable point on a phone.
 *
 * Navigation holds destinations; the FAB holds verbs. The two never mix.
 */
export function Fab({
  label,
  onClick,
  icon,
  className,
}: {
  readonly label: string
  readonly onClick?: (() => void) | undefined
  readonly icon?: ReactNode
  readonly className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        haptic('commit')
        onClick?.()
      }}
      className={cn(
        'flex size-14 items-center justify-center rounded-pill',
        'bg-accent-fill text-accent-on-fill shadow-lg',
        'transition-base active:scale-95',
        className,
      )}
    >
      {icon ?? <Plus size={24} aria-hidden />}
    </button>
  )
}
