/**
 * Motion primitives. (PRD UX-10, UX-15)
 *
 * Every transition in the product comes from this file. Ad-hoc durations are
 * how an interface stops feeling like one piece of software.
 *
 * 150–200ms, ease-out. Nothing bounces. Nothing overshoots. A spring that
 * settles past its target reads as playful, and this product is not playful —
 * it is calm.
 */

export const duration = {
  fast: 0.15,
  base: 0.175,
  slow: 0.2,
} as const

/** Matches --ease-out in tokens.css. Decelerating, no overshoot. */
export const easeOut = [0.2, 0, 0, 1] as const

export const transition = {
  fast: { duration: duration.fast, ease: easeOut },
  base: { duration: duration.base, ease: easeOut },
  slow: { duration: duration.slow, ease: easeOut },
} as const

/** Fade with a short rise. The default for content entering a layout. */
export const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
  transition: transition.base,
} as const

export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: transition.fast,
} as const

/** Bottom sheet. Travel is vertical only; sheets never scale. */
export const sheet = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: transition.slow,
} as const

/** Centred modal on pointer devices. */
export const modal = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: transition.base,
} as const

/**
 * List stagger. Capped deliberately: beyond ~8 items the last row arrives late
 * enough to read as sluggishness rather than polish.
 */
export const stagger = (index: number, max = 8) => ({
  ...fadeInUp,
  transition: { ...transition.base, delay: Math.min(index, max) * 0.03 },
})

/**
 * Haptic feedback for the three moments that warrant it. (PRD UX-14)
 *
 * Silently absent on unsupported platforms, including iOS Safari, so callers
 * never need to feature-detect.
 */
export type HapticKind = 'success' | 'commit' | 'warning'

const HAPTIC_PATTERNS: Record<HapticKind, number | readonly number[]> = {
  success: 12,
  commit: 8,
  warning: [10, 40, 10],
}

export function haptic(kind: HapticKind): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  navigator.vibrate(HAPTIC_PATTERNS[kind] as number | number[])
}
