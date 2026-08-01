import { cn } from '@/lib/cn'
import { monogram } from '@/lib/format'

/**
 * A borrower's photograph, or their initials.
 *
 * The monogram is derived from the name rather than random, so the same person
 * always looks the same — a small thing that makes a list feel stable.
 */
export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  readonly name: string
  readonly src?: string | null
  readonly size?: number
  readonly className?: string
}) {
  const dimension = { width: size, height: size }
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        style={dimension}
        className={cn('rounded-pill object-cover', className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      style={dimension}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-pill',
        'bg-surface-elevated text-secondary text-label font-medium',
        className,
      )}
    >
      {monogram(name)}
    </span>
  )
}
