'use client'

import { useEffect, useRef, useState } from 'react'
import type { Minor } from '@/domain/money'
import { cn } from '@/lib/cn'
import { formatMoney, type MoneyFormatOptions } from '@/lib/format'

/**
 * The single figure a screen exists to show.
 *
 * Counts up on FIRST PAINT ONLY (PRD UX-11). Re-animating on every re-render
 * would make the number look unstable, which is the opposite of what a
 * portfolio value should feel like.
 *
 * The count is interpolated over a Number for animation, but the FINAL frame
 * renders the exact bigint. An intermediate frame being a rounded double is
 * harmless; the resting value never is.
 */
export function HeroValue({
  amount,
  className,
  durationMs = 650,
  ...options
}: MoneyFormatOptions & {
  readonly amount: Minor
  readonly className?: string
  readonly durationMs?: number
}) {
  const [display, setDisplay] = useState<Minor | null>(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (hasAnimated.current) {
      setDisplay(amount)
      return
    }
    hasAnimated.current = true

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || amount === 0n) {
      setDisplay(amount)
      return
    }

    const target = Number(amount)
    const start = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1)
      // Ease-out cubic: fast then settling, never overshooting. (PRD UX-10)
      const eased = 1 - (1 - progress) ** 3
      if (progress >= 1) {
        setDisplay(amount) // exact value, always
        return
      }
      setDisplay(BigInt(Math.round(target * eased)) as Minor)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [amount, durationMs])

  return (
    <span className={cn('text-display tabular block', className)}>
      {formatMoney(display ?? amount, options)}
    </span>
  )
}
