// Offline shell for on-trip use: visitors routinely lose signal in subways and
// alleys, and the guide is least useful exactly when it cannot load.
// Strategy: cache-first for the app shell, refreshed in the background.

// Stamped per build by tools/stamp-sw.mjs. A fixed name would make the very
// first visit permanent: activate() only drops caches whose name differs, so
// without a new name every redeploy keeps serving the shell it cached first.
const CACHE = 'ontrip-376312c22615'

// Hashed asset filenames, injected at build time. Precaching these is not an
// optimisation: on a first visit the worker activates *after* the page has
// already fetched them, so it never sees those requests and would otherwise
// hold a shell whose scripts are missing — a blank page the moment signal drops.
const ASSETS = ["./assets/index-B8NzZsu0.css","./assets/index-CgPZPCRZ.js"]

const scoped = (p) => new URL(p, self.registration.scope).pathname
const INDEX = scoped('./index.html')

self.addEventListener('install', (e) => {
  const shell = ['./', './index.html', ...ASSETS].map(scoped)
  // Added one at a time: with addAll, a single missing entry rejects the whole
  // install and the visitor ends up with no offline shell at all.
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(shell.map((p) => c.add(p).catch(() => {}))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return
  }

  e.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => null)

      if (hit) {
        // Serve immediately, refresh in the background.
        fresh.catch(() => {})
        return hit
      }

      return fresh.then((res) => {
        if (res) return res
        // Offline and never seen: a navigation still deserves the app shell.
        // Anything else fails honestly rather than as an empty 200.
        if (request.mode === 'navigate') return caches.match(INDEX)
        return Response.error()
      })
    }),
  )
})
