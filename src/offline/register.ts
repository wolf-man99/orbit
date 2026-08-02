/**
 * Service worker registration and flush triggers. (Phase 4 §10.2)
 *
 * Background Sync is unavailable in Safari, so `online` and `visibilitychange`
 * are the PRIMARY triggers and Background Sync is a progressive enhancement —
 * not the mechanism. Relying on it would mean iOS silently never syncs.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    // A failed registration degrades to an online-only app; it is never fatal.
  })
}

export function onFlushTriggers(flush: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') flush()
  }

  window.addEventListener('online', flush)
  document.addEventListener('visibilitychange', handleVisibility)

  return () => {
    window.removeEventListener('online', flush)
    document.removeEventListener('visibilitychange', handleVisibility)
  }
}
