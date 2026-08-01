import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * Skeletons, never spinners. (PRD UX-13, UX-12)
 *
 * A skeleton must match the geometry of what replaces it, or it trades a
 * spinner for a layout shift — which is worse, and counts against CLS.
 * Callers pass explicit dimensions for that reason.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-sm bg-surface-elevated', className)}
      {...props}
    />
  )
}

/** Matches the metric card in components/data. */
export function MetricSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
    </div>
  )
}

/** Matches a borrower row: avatar, two lines of text, a trailing amount. */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-10 w-10 rounded-pill" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-20" />
      </div>
      <Skeleton className="h-5 w-20" />
    </div>
  )
}
