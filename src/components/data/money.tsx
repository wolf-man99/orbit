import type { Minor } from '@/domain/money'
import { cn } from '@/lib/cn'
import { formatMoney, type MoneyFormatOptions } from '@/lib/format'

/**
 * Every monetary figure in the product renders through this component.
 *
 * Two things it guarantees that scattered `formatMoney` calls would not:
 *   • `.tabular` is always applied, so digits align down a column (PRD M-07)
 *   • the machine-readable value is exposed, so screen readers and copy-paste
 *     get the exact amount rather than an abbreviated one
 */
export interface MoneyProps extends MoneyFormatOptions {
  readonly amount: Minor
  readonly className?: string
  /** Colours the value by direction. For deltas only, never for balances. */
  readonly colorBySign?: boolean
}

export function Money({ amount, className, colorBySign = false, ...options }: MoneyProps) {
  const formatted = formatMoney(amount, options)
  const tone = !colorBySign
    ? undefined
    : amount > 0n
      ? 'text-accent'
      : amount < 0n
        ? 'text-secondary'
        : undefined

  return (
    <span
      className={cn('tabular', tone, className)}
      // Compact styles abbreviate; the precise value stays available.
      title={options.style === 'compact' ? formatMoney(amount, { ...options, style: 'precise' }) : undefined}
    >
      {formatted}
    </span>
  )
}
