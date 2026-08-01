import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

/**
 * Empty, error, and offline states. (Phase 2 §13, §14)
 *
 * Every data surface implements all five states. These cover three of them;
 * loading is `Skeleton`, and success is the content itself.
 *
 * Copy is calm and factual, never cute and never blaming. An empty state always
 * carries the action that resolves it.
 */

export function EmptyState({
  icon: Icon,
  headline,
  support,
  action,
  className,
}: {
  readonly icon?: LucideIcon
  readonly headline: string
  readonly support?: string
  readonly action?: ReactNode
  readonly className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon ? <Icon size={28} className="mb-4 text-muted" aria-hidden /> : null}
      <p className="text-body text-primary">{headline}</p>
      {support ? <p className="mt-1 max-w-xs text-label text-secondary">{support}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

/**
 * A widget-level failure. One broken card never blanks a screen (PRD REL-04),
 * so this is sized to sit inside a grid cell rather than replace the page.
 */
export function ErrorState({
  headline = 'We could not load this',
  support,
  onRetry,
  requestId,
  className,
}: {
  readonly headline?: string
  readonly support?: string
  readonly onRetry?: () => void
  readonly requestId?: string
  readonly className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-card border border-border bg-surface px-6 py-8 text-center',
        className,
      )}
    >
      <p className="text-body text-primary">{headline}</p>
      {support ? <p className="mt-1 text-label text-secondary">{support}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
      {/* Safe to show: it correlates with server logs and contains no PII. */}
      {requestId ? <p className="mt-3 text-caption text-muted tabular">{requestId}</p> : null}
    </div>
  )
}

/**
 * Discreet, never alarming. Being offline is a supported state, not an error
 * — the queue is working and the user has lost nothing. (Phase 4 §10.3)
 */
export function OfflineIndicator({
  pendingCount,
  lastSyncedAt,
  className,
}: {
  readonly pendingCount: number
  readonly lastSyncedAt?: string
  readonly className?: string
}) {
  return (
    <div
      role="status"
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-pill border border-border',
        'bg-surface-elevated px-3 py-1.5 text-caption text-secondary',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-pill bg-warning" />
      {/* One line, truncated rather than wrapped: a status chip that reflows to
          two lines reads as a problem, which is the opposite of the intent. */}
      <span className="truncate">
        Offline
        {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
        {lastSyncedAt ? ` · synced ${lastSyncedAt}` : ''}
      </span>
    </div>
  )
}
