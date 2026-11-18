// SEE Bridge service worker: phone alerts and the app badge.
// Alerts arrive empty; this asks the hub what's new for this device and shows it.
// Pushes are handled one at a time, so two pushes that arrive together can't both show the same alert,
// and alerts older than 12 hours are never shown (they're still in the inbox).
var API_DEFAULT = 'https://www.see.school/_functions/seeForm';
var MAX_AGE = 12 * 3600e3;
var queue = Promise.resolve();
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function getState() {
  return caches.open('see-hub').then(function (c) { return c.match('hub-state'); })
    .then(function (r) { return r ? r.json() : {}; }).catch(function () { return {}; });
}
function setState(st) {
  return caches.open('see-hub').then(function (c) {
    return c.put('hub-state', new Response(JSON.stringify(st), { headers: { 'Content-Type': 'application/json' } }));
  }).catch(function () {});
}
function badge(n) {
  try {
    if (self.navigator && self.navigator.setAppBadge) return n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge();
  } catch (e) {}
  return Promise.resolve();
}

function handlePush() {
  return getState().then(function (st) {
    if (!st.token) return 0;
    return fetch(st.api || API_DEFAULT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form: 'hub', action: 'peek', token: st.token, since: st.since || '' })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return 0;
      var all = j.alerts || [];
      var now = Date.now();
      var list = all.filter(function (a) { var t = Date.parse(a.at); return !isNaN(t) && now - t < MAX_AGE; }).slice(0, 3);
      if (all.length) { st.since = all[0].at; } // newest one, even if it was too old to show, so it never comes back
      return setState(st).then(function () { return badge(j.unread || 0); }).then(function () {
        return Promise.all(list.slice().reverse().map(function (a) {
          return self.registration.showNotification(a.title, { body: a.text, tag: a.id, icon: 'images/hub-icon-192.png', badge: 'images/hub-icon-192.png', data: { url: 'hub.html#inbox' } }).then(function () { return 1; }, function () { return 0; });
        }));
      }).then(function (r) { return r.reduce(function (x, y) { return x + y; }, 0); });
    }).catch(function () { return 0; });
  }).then(function (shown) {
    if (!shown) return self.registration.showNotification('SEE Bridge', { body: 'Something new is waiting for you.', tag: 'see-hub', icon: 'images/hub-icon-192.png', data: { url: 'hub.html#inbox' } });
  });
}

self.addEventListener('push', function (e) {
  var job = queue.then(handlePush, handlePush);
  queue = job.catch(function () {});
  e.waitUntil(job);
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || 'hub.html#inbox';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (all) {
    for (var i = 0; i < all.length; i++) {
      if (/\/hub(\.html)?/.test(all[i].url)) { all[i].postMessage({ go: 'inbox' }); return all[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
