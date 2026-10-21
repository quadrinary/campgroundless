// App shell for offline use. Map data is never cached here: saved offline
// areas live in their own cache and IndexedDB, managed by offline.js.
const SHELL_CACHE = "campgroundless-shell-v2";
const PAGES = ["./", "./index.html", "./settings.html"];
const EXTRAS = [
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./vendor/images/layers.png",
  "./vendor/images/layers-2x.png",
  "./vendor/images/marker-icon.png",
  "./vendor/images/marker-icon-2x.png",
  "./vendor/images/marker-shadow.png",
];
const NETWORK_TIMEOUT_MS = 4000;

// Precache each page plus every same-origin script and stylesheet it references,
// so the exact versioned files the page asks for are available offline.
async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  const assets = new Set(EXTRAS);
  for (const page of PAGES) {
    const response = await fetch(page, { cache: "reload" });
    if (!response.ok) {
      continue;
    }
    await cache.put(page, response.clone());
    const html = await response.text();
    for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
      assets.add(match[1]);
    }
  }
  await Promise.all(
    [...assets].map((asset) =>
      fetch(asset, { cache: "reload" })
        .then((response) => (response.ok ? cache.put(asset, response) : null))
        .catch(() => null),
    ),
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precache().catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("campgroundless-shell-") && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function store(request, response) {
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

// Network first, but fall back to the cache quickly when a weak signal
// leaves the request hanging.
function networkFirst(request, fallback) {
  const network = fetch(request).then((response) => store(request, response));
  network.catch(() => {});
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  const cached = () => caches.match(request, { ignoreSearch: request.mode === "navigate" });
  return Promise.race([network, timeout.then(() => cached().then((hit) => hit || network))])
    .catch(() => null)
    .then(async (response) => response || (await cached()) || (await network.catch(() => null)) || (fallback ? caches.match(fallback) : null))
    .then((response) => response || Response.error());
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }
  // Versioned files and icons never change at the same URL.
  if (url.searchParams.has("v") || url.pathname.includes("/vendor/") || url.pathname.includes("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) => hit || fetch(request).then((response) => store(request, response)),
      ),
    );
    return;
  }
  event.respondWith(networkFirst(request));
});