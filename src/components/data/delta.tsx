import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPercent } from '@/lib/format'

/**
 * A change over a period.
 *
 * Direction is carried by BOTH an arrow and a colour, because colour alone
 * fails ACC-06 and is invisible to a significant share of users.
 */
export function Delta({
  value,
  label,
  className,
}: {
  /** Fractional change: 0.07 renders as +7%. */
  readonly value: number
  readonly label?: string
  readonly className?: string
}) {
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  const tone = value > 0 ? 'text-accent' : value < 0 ? 'text-danger' : 'text-muted'
  const sign = value > 0 ? '+' : ''

  return (
    <span className={cn('inline-flex items-center gap-1 text-caption tabular', tone, className)}>
      <Icon size={12} aria-hidden />
      {sign}
      {formatPercent(value, 'en-IN', Math.abs(value) < 0.1 ? 1 : 0)}
      {label ? <span className="text-muted">{label}</span> : null}
    </span>
  )
}
