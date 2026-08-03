'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * A bottom sheet on a touch viewport, a centred modal on a pointer one — one
 * component, not two, so the two can never drift out of sync. (Phase 2 §3.3,
 * Phase 7 §5)
 *
 * Radix unmounts `Content` on close before an exit transition can play, so
 * only the entrance animates. That is a deliberate trade against the
 * complexity of `forceMount` + manually timed unmounting for a dialog whose
 * open state already reads as instantaneous.
 */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  readonly title: string
  readonly description?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
          'transition-base data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto',
          'rounded-t-[var(--radius-sheet)] border-t border-border bg-surface p-6 shadow-lg',
          'pb-[calc(env(safe-area-inset-bottom)+1.5rem)]',
          'transition-base data-[state=closed]:translate-y-full data-[state=open]:translate-y-0',
          'lg:inset-x-auto lg:inset-y-auto lg:left-1/2 lg:top-1/2 lg:w-full lg:max-w-md',
          'lg:-translate-x-1/2 lg:rounded-card lg:border lg:pb-6',
          'lg:data-[state=closed]:-translate-y-[calc(50%-8px)] lg:data-[state=closed]:translate-x-[-50%]',
          'lg:data-[state=open]:-translate-y-1/2 lg:data-[state=open]:translate-x-[-50%]',
          'lg:data-[state=closed]:opacity-0 lg:data-[state=open]:opacity-100',
          className,
        )}
        {...props}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <DialogPrimitive.Title className="text-title">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-label text-secondary">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-pill text-secondary transition-base hover:bg-surface-elevated hover:text-primary"
          >
            <X size={18} aria-hidden />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} />
}

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  readonly label: string
  readonly htmlFor: string
  readonly error?: string | undefined
  readonly children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-label text-secondary">
        {label}
      </label>
      {children}
      {error ? <p className="text-caption text-danger">{error}</p> : null}
    </div>
  )
}

export const inputClass = cn(
  'h-11 w-full rounded-input border border-border-interactive bg-bg px-3 text-body text-primary',
  'transition-base placeholder:text-muted',
  'focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/30',
)
