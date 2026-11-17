// SEE Bridge service worker: phone alerts and the app badge.
// Alerts arrive empty; this asks the hub what's new for this device and shows it.
var API_DEFAULT = 'https://www.see.school/_functions/seeForm';
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

self.addEventListener('push', function (e) {
  e.waitUntil(getState().then(function (st) {
    if (!st.token) return 0;
    return fetch(st.api || API_DEFAULT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form: 'hub', action: 'peek', token: st.token, since: st.since || '' })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return 0;
      var list = (j.alerts || []).slice(0, 3);
      if (list.length) { st.since = list[0].at; }
      return setState(st).then(function () { return badge(j.unread || 0); }).then(function () {
        return Promise.all(list.slice().reverse().map(function (a) {
          return self.registration.showNotification(a.title, { body: a.text, tag: a.id, icon: 'images/hub-icon-192.png', badge: 'images/hub-icon-192.png', data: { url: 'hub.html#inbox' } }).then(function () { return 1; }, function () { return 0; });
        }));
      }).then(function (r) { return r.reduce(function (x, y) { return x + y; }, 0); });
    }).catch(function () { return 0; });
  }).then(function (shown) {
    if (!shown) return self.registration.showNotification('SEE Bridge', { body: 'Something new is waiting for you.', tag: 'see-hub', icon: 'images/hub-icon-192.png', data: { url: 'hub.html#inbox' } });
  }));
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
