/* 由 scripts/pwa.mjs 在构建时填充版本号与预缓存清单 */
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const CACHE = `chat-demo-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})

/** 导航请求优先走网络，断网或服务未启动时回退到缓存的页面外壳 */
const navigate = (request) =>
  fetch(request).catch(() =>
    caches
      .match(new URL('index.html', self.registration.scope))
      .then(
        (response) => response || caches.match(new URL('./', self.registration.scope))
      )
  )

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }
  const url = new URL(request.url)
  // API、图片等跨域请求不经过缓存
  if (url.origin !== self.location.origin) {
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request))
    return
  }
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
    )
  )
})
