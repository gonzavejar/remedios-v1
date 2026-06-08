// public/sw.js
// Service Worker — Remedios Chile
// Notificaciones de alarma aunque la app esté cerrada.

const CACHE_VERSION = 'remedios-v2'
const URLS_CACHE = ['/', '/plan', '/receta', '/historial', '/perfil']
const alarmasTimers = {}

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(URLS_CACHE))
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    clients.claim(),
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  ]))
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return
  if (event.request.url.includes('/api/')) return
  event.respondWith(
    fetch(event.request)
      .then(res => { caches.open(CACHE_VERSION).then(c => c.put(event.request, res.clone())); return res })
      .catch(() => caches.match(event.request))
  )
})

self.addEventListener('message', event => {
  if (event.data?.type === 'PROGRAMAR_ALARMAS') programarAlarmas(event.data.alarmas)
  if (event.data?.type === 'CANCELAR_ALARMAS') cancelarTodas()
})

function cancelarTodas() {
  Object.values(alarmasTimers).forEach(id => clearTimeout(id))
  Object.keys(alarmasTimers).forEach(k => delete alarmasTimers[k])
}

function programarAlarmas(alarmas) {
  cancelarTodas()
  const ahora = Date.now()
  alarmas.forEach((a, i) => {
    const delay = a.timestamp - ahora
    if (delay < 1000 || delay > 24 * 60 * 60 * 1000) return
    alarmasTimers[i] = setTimeout(() => {
      self.registration.showNotification(`💊 ${a.nombre}`, {
        body: a.descripcion,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `remedio-${i}`,
        requireInteraction: true,
        data: { url: '/plan' },
        actions: [
          { action: 'ver',   title: '📋 Ver plan' },
          { action: 'listo', title: '✅ Ya lo tomé' }
        ]
      })
    }, delay)
  })
}

self.addEventListener('notificationclick', event => {
  event.notification.close()
  if (event.action === 'listo') return
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin)) { c.focus(); c.navigate('/plan'); return }
      }
      return clients.openWindow('/plan')
    })
  )
})
