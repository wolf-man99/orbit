import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * The base container. 20px radius per the PRD, and a border rather than a
 * shadow: on a near-black background a shadow is close to invisible, so depth
 * comes from surface lightness. (Phase 7 §5)
 */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-card border border-border bg-surface p-4', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-3 flex items-start justify-between gap-2', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-label text-secondary', className)} {...props} />
}
