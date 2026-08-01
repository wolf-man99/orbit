import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * Status is never conveyed by colour alone. (PRD ACC-06)
 *
 * `StatusPill` therefore takes a label, and callers pair it with a glyph where
 * the surrounding context is dense.
 */
const badge = cva(
  'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-elevated text-secondary',
        accent: 'bg-accent-subtle text-accent',
        info: 'bg-info-subtle text-info',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-danger-subtle text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badge> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />
}

/** Maps a derived status to its tone and its human label. */
const STATUS_TONE = {
  ACTIVE: { tone: 'accent', label: 'Active' },
  DUE_SOON: { tone: 'warning', label: 'Due soon' },
  DUE: { tone: 'warning', label: 'Due' },
  OVERDUE: { tone: 'danger', label: 'Overdue' },
  DORMANT: { tone: 'neutral', label: 'Dormant' },
  CLOSED: { tone: 'neutral', label: 'Closed' },
  ARCHIVED: { tone: 'neutral', label: 'Archived' },
  WRITTEN_OFF: { tone: 'neutral', label: 'Written off' },
  SETTLED: { tone: 'accent', label: 'Settled' },
  PARTIAL: { tone: 'warning', label: 'Partial' },
  UPCOMING: { tone: 'neutral', label: 'Upcoming' },
} as const satisfies Record<string, { tone: BadgeProps['tone']; label: string }>

export type StatusKey = keyof typeof STATUS_TONE

export function StatusPill({ status, className }: { status: StatusKey; className?: string }) {
  const { tone, label } = STATUS_TONE[status]
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  )
}
