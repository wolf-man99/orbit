import type { ReactNode } from 'react'
import type { Minor } from '@/domain/money'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { Money } from './money'

/**
 * A single portfolio signal.
 *
 * `asOf` is required rather than optional: PRD D-16 forbids presenting an
 * undated figure, and a required prop is the only version of that rule that
 * survives contact with a deadline.
 */
export interface MetricCardProps {
  readonly label: string
  readonly amount?: Minor
  readonly value?: ReactNode
  readonly asOf: string
  readonly caption?: ReactNode
  readonly currency?: string
  readonly className?: string
  /** Zero-value cards recede rather than occupying prime space. (Phase 2 §6.1) */
  readonly dimWhenZero?: boolean
}

export function MetricCard({
  label,
  amount,
  value,
  asOf,
  caption,
  currency,
  className,
  dimWhenZero = false,
}: MetricCardProps) {
  const quiet = dimWhenZero && amount === 0n

  return (
    <Card className={cn(quiet && 'opacity-60', className)}>
      <p className="text-label text-secondary">{label}</p>
      <p className="mt-2 text-title tabular">
        {amount !== undefined ? (
          <Money amount={amount} style="hero" {...(currency ? { currency } : {})} />
        ) : (
          value
        )}
      </p>
      {caption ? <p className="mt-1 text-caption text-muted">{caption}</p> : null}
      <span className="sr-only">as of {asOf}</span>
    </Card>
  )
}
