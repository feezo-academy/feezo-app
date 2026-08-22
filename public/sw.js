// Minimal service worker for FeeZo.
//
// Its only job right now is to exist and be registered, so the app can
// call `registration.showNotification()` instead of `new Notification()`.
// Android Chrome blocks the `new Notification()` constructor outright and
// requires notifications to go through a Service Worker registration —
// this file is that registration. No offline caching, no push handling
// yet (that would be a bigger step — real push notifications that work
// even when the app is fully closed).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Tapping a notification focuses an already-open FeeZo tab, or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
