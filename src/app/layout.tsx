import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Orbit — What Moves, Grows',
  description: 'A personal capital operating system for private lenders.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#09090B' },
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
  ],
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  // Dark is the origin; light is opt-in via the `light` class. (Phase 7 §3.3)
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
