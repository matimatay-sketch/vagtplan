// Turnus service worker: keeps the app shell available offline.
// Pages are per user, so they are network-first; the last copy of a page is
// the offline fallback. Stamps made offline are queued by the page itself
// (localStorage) and sent when the network returns.
const VERSION = "turnus-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Registered as /sw.js?dev=1 during development: push only, no offline cache.
const DEV = new URL(self.location.href).searchParams.has("dev");

self.addEventListener("fetch", (event) => {
  if (DEV) return;
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(STATIC).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(url.pathname)
            .then((hit) => hit || caches.match("/tid"))
            .then((hit) => hit || Response.error()),
        ),
    );
  }
});

// Push notifications: the server sends the title, a short text and where a tap
// goes (never the content of a message).
self.addEventListener("push", (event) => {
  let n = { title: "Turnus", body: "", url: "/oversigt", tag: "turnus" };
  try {
    n = { ...n, ...event.data.json() };
  } catch {
    // Not JSON: show the generic notification.
  }
  event.waitUntil(
    self.registration.showNotification(n.title, {
      body: n.body,
      tag: n.tag,
      renotify: true,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "da",
      data: { url: n.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/oversigt", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === target.origin);
      if (open) return open.navigate(target.href).then((w) => (w || open).focus());
      return self.clients.openWindow(target.href);
    }),
  );
});
