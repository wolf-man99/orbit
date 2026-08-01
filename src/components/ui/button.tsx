import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * Only ONE primary action may exist on a screen. (PRD DS-06)
 *
 * `accent` is reserved for that action and for positive financial movement —
 * never for decoration (DS-05). Everything else is `secondary` or `ghost`.
 */
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-button font-medium ' +
    'transition-base select-none whitespace-nowrap ' +
    'disabled:pointer-events-none disabled:opacity-40 ' +
    // The 44pt floor (PRD ACC-05) is an Apple HIG *touch* guideline, so it is
    // scoped to coarse pointers. Applying it unconditionally made `size="sm"`
    // inert — every button rendered at 44px regardless of variant. WCAG 2.2
    // SC 2.5.8 asks 24px at AA, which the smallest size clears on a mouse.
    '[@media(pointer:coarse)]:min-h-[44px]',
  {
    variants: {
      variant: {
        primary: 'bg-accent-fill text-accent-on-fill hover:opacity-90 active:opacity-80',
        secondary:
          'bg-surface-elevated text-primary border border-border-interactive hover:border-border-strong',
        ghost: 'text-secondary hover:bg-surface-elevated hover:text-primary',
        danger: 'bg-danger-fill text-danger-on-fill hover:opacity-90 active:opacity-80',
        link: 'text-accent underline-offset-4 hover:underline min-h-0',
      },
      size: {
        sm: 'h-9 px-3 text-label',
        md: 'h-11 px-4 text-body',
        lg: 'h-13 px-6 text-body',
        icon: 'h-11 w-11 p-0',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: 'md', full: false },
  },
)

export interface ButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof button> {
  readonly asChild?: boolean
}

export function Button({ className, variant, size, full, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return <Component className={cn(button({ variant, size, full }), className)} {...props} />
}

export { button as buttonVariants }
