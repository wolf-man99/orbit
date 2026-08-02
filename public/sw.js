/**
 * Orbit service worker. (Phase 4 §10.4)
 *
 * Caching strategy is deliberately per-surface rather than uniform:
 *   app shell     cache-first        instant repeat launch (PRD P-04)
 *   read APIs     stale-while-revalidate  useful offline; freshness not critical
 *   mutations     NEVER cached       they are queued in IndexedDB instead
 *
 * Mutations are never intercepted here. Replay is driven from the page, where
 * the queue lives and where a failure can be surfaced to the user.
 */
const SHELL_CACHE = 'orbit-shell-v1'
const DATA_CACHE = 'orbit-data-v1'
const SHELL = ['/', '/dashboard', '/borrowers', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => ![SHELL_CACHE, DATA_CACHE].includes(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return // mutations are queued, never cached

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }
  event.respondWith(cacheFirst(request))
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    const cache = await caches.open(SHELL_CACHE)
    cache.put(request, response.clone())
    return response
  } catch {
    // Offline and uncached: fall back to the shell so navigation still works.
    return (await caches.match('/dashboard')) ?? Response.error()
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      cache.put(request, response.clone())
      return response
    })
    .catch(() => cached ?? Response.error())
  return cached ?? network
}

/**
 * Web Push. (PRD R-07)
 *
 * The notification deep-links to where it can be ACTED ON, pre-scoped, so
 * notification to recorded payment is one tap. (Phase 2 §12.2)
 */
self.addEventListener('push', (event) => {
  if (!event.data) return
  const payload = event.data.json()
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge.png',
      tag: payload.dedupeKey, // collapses duplicates rather than stacking them
      data: { deepLink: payload.deepLink ?? '/notifications' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.deepLink ?? '/notifications'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing window rather than opening a second copy of the app.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
