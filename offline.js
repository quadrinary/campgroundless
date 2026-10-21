// Offline areas: IndexedDB for pack metadata and vector data, Cache Storage for
// raster tiles. Tiles are stored under synthetic URLs so they are shared between
// overlapping packs and never confused with live provider responses.
(() => {
  "use strict";

  const DB_NAME = "campgroundless-offline";
  const DB_VERSION = 1;
  const TILE_CACHE = "campgroundless-offline-tiles-v1";
  const TILE_ORIGIN = "https://offline-tiles.campgroundless.invalid";
  const STALE_DAYS = 30;

  // Only providers whose terms allow saving tiles for offline use.
  const basemaps = {
    "usgs-topo": {
      label: "USGS Topo",
      description: "Contours, trails and backroads · public domain",
      url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
      maxNativeZoom: 16,
      averageTileBytes: 24000,
      attribution: "USGS The National Map (saved offline)",
    },
    "usgs-imagery-topo": {
      label: "USGS Imagery + Topo",
      description: "Aerial imagery with labels · public domain",
      url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}",
      maxNativeZoom: 16,
      averageTileBytes: 42000,
      attribution: "USGS The National Map (saved offline)",
    },
  };

  const supported = Boolean(window.indexedDB && window.caches && window.isSecureContext);

  let dbPromise;
  function openDb() {
    dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("packs")) {
          db.createObjectStore("packs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("data")) {
          db.createObjectStore("data", { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function transact(storeName, mode, operation) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      const request = operation(store);
      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Storage transaction aborted."));
    });
  }

  const listPacks = async () =>
    ((await transact("packs", "readonly", (store) => store.getAll())) ?? []).sort(
      (first, second) => String(second.createdAt).localeCompare(String(first.createdAt)),
    );
  const savePack = (pack) => transact("packs", "readwrite", (store) => store.put(pack));
  const putData = (packId, layer, value) =>
    transact("data", "readwrite", (store) => store.put({ key: `${packId}:${layer}`, value }));
  const getData = async (packId, layer) =>
    (await transact("data", "readonly", (store) => store.get(`${packId}:${layer}`)))?.value ?? null;

  // --- Tile math (Web Mercator XYZ) ---
  function lngToTileX(lng, zoom) {
    return Math.floor(((lng + 180) / 360) * 2 ** zoom);
  }
  function latToTileY(lat, zoom) {
    const radians = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom,
    );
  }
  function tileRange(bounds, zoom) {
    const max = 2 ** zoom - 1;
    const clamp = (value) => Math.max(0, Math.min(max, value));
    return {
      minX: clamp(lngToTileX(bounds.west, zoom)),
      maxX: clamp(lngToTileX(bounds.east, zoom)),
      minY: clamp(latToTileY(bounds.north, zoom)),
      maxY: clamp(latToTileY(bounds.south, zoom)),
    };
  }
  function countTiles(bounds, minZoom, maxZoom) {
    let count = 0;
    for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
      const range = tileRange(bounds, zoom);
      count += (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
    }
    return count;
  }
  function* tiles(bounds, minZoom, maxZoom) {
    for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
      const range = tileRange(bounds, zoom);
      for (let x = range.minX; x <= range.maxX; x += 1) {
        for (let y = range.minY; y <= range.maxY; y += 1) {
          yield { z: zoom, x, y };
        }
      }
    }
  }
  // Web Mercator extent of a tile, for ArcGIS export requests.
  function tileMercatorBounds({ z, x, y }) {
    const size = (2 * 20037508.342789244) / 2 ** z;
    const minX = -20037508.342789244 + x * size;
    const maxY = 20037508.342789244 - y * size;
    return [minX, maxY - size, minX + size, maxY];
  }
  function tileKey(layer, { z, x, y }) {
    return `${TILE_ORIGIN}/${encodeURIComponent(layer)}/${z}/${x}/${y}`;
  }
  function tileInPack(pack, layer, tile) {
    const range = pack.tileLayers?.[layer];
    if (!range || tile.z < range.minZoom || tile.z > range.maxZoom) {
      return false;
    }
    const tileBox = tileRange(pack.bounds, tile.z);
    return (
      tile.x >= tileBox.minX && tile.x <= tileBox.maxX && tile.y >= tileBox.minY && tile.y <= tileBox.maxY
    );
  }

  // Runs tasks with bounded concurrency so providers are not flooded.
  async function runQueue(items, concurrency, worker, signal) {
    const iterator = items[Symbol.iterator]();
    let failure = null;
    async function lane() {
      for (;;) {
        if (signal?.aborted || failure) {
          return;
        }
        const next = iterator.next();
        if (next.done) {
          return;
        }
        try {
          await worker(next.value);
        } catch (error) {
          failure ??= error;
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, lane));
    if (signal?.aborted) {
      throw new DOMException("Download canceled.", "AbortError");
    }
    if (failure) {
      throw failure;
    }
  }

  async function fetchWithRetry(url, signal, attempts = 3) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(url, { signal, mode: "cors", credentials: "omit" });
        if (response.ok || response.status === 404) {
          return response;
        }
        lastError = new Error(`Tile request failed (${response.status}).`);
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
    throw lastError;
  }

  // Downloads tiles for one layer into the shared tile cache. Tiles already
  // cached (from another pack or an interrupted attempt) are skipped unless
  // refresh is set.
  function* unseenTiles(layer, bounds, minZoom, maxZoom, seen) {
    for (const tile of tiles(bounds, minZoom, maxZoom)) {
      if (seen) {
        const key = tileKey(layer, tile);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
      }
      yield tile;
    }
  }

  // `seen` lets a large area be downloaded in parts without fetching or counting
  // tiles on shared part edges twice.
  async function downloadTiles({ layer, urlFor, bounds, minZoom, maxZoom, signal, onTile, refresh = false, concurrency = 4, seen = null }) {
    const cache = await caches.open(TILE_CACHE);
    let bytes = 0;
    await runQueue(
      unseenTiles(layer, bounds, minZoom, maxZoom, seen),
      concurrency,
      async (tile) => {
        const key = tileKey(layer, tile);
        const existing = refresh ? null : await cache.match(key);
        if (existing) {
          const size = Number(existing.headers.get("X-Byte-Length")) || 0;
          bytes += size;
          onTile?.(size);
          return;
        }
        const response = await fetchWithRetry(urlFor(tile), signal);
        if (response.status === 404) {
          onTile?.(0);
          return;
        }
        const type = response.headers.get("Content-Type") || "";
        if (!type.startsWith("image/")) {
          throw new Error("A map provider returned an unexpected response instead of an image.");
        }
        const blob = await response.blob();
        await cache.put(
          key,
          new Response(blob, {
            headers: { "Content-Type": type, "X-Byte-Length": String(blob.size) },
          }),
        );
        bytes += blob.size;
        onTile?.(blob.size);
      },
      signal,
    );
    return bytes;
  }

  // Removes a pack and any cached tiles no other pack still needs.
  async function deletePack(pack) {
    const others = (await listPacks()).filter((entry) => entry.id !== pack.id);
    if (window.caches) {
      const cache = await caches.open(TILE_CACHE);
      for (const [layer, range] of Object.entries(pack.tileLayers ?? {})) {
        await runQueue(tiles(pack.bounds, range.minZoom, range.maxZoom), 16, async (tile) => {
          if (!others.some((other) => tileInPack(other, layer, tile))) {
            await cache.delete(tileKey(layer, tile));
          }
        });
      }
    }
    await transact("data", "readwrite", (store) =>
      store.delete(IDBKeyRange.bound(`${pack.id}:`, `${pack.id}:\uffff`)),
    );
    await transact("packs", "readwrite", (store) => store.delete(pack.id));
  }

  async function storageSummary() {
    const estimate = (await navigator.storage?.estimate?.()) ?? {};
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    return { usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted };
  }

  async function requestPersistence() {
    try {
      return (await navigator.storage?.persist?.()) ?? false;
    } catch {
      return false;
    }
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) {
      return "unknown size";
    }
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
    }
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  function packAgeDays(pack, now = Date.now()) {
    return Math.floor((now - Date.parse(pack.createdAt)) / 86400000);
  }

  // Draws a cached tile, or a scaled section of the nearest cached ancestor so
  // zooming past a pack's saved detail level stays readable instead of blank.
  function createCachedTileLayer(layer, options = {}) {
    const CachedTileLayer = L.GridLayer.extend({
      createTile(coords, done) {
        const tile = document.createElement("canvas");
        const size = this.getTileSize();
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        tile.width = size.x * ratio;
        tile.height = size.y * ratio;
        tile.setAttribute("role", "presentation");
        drawCachedTile(layer, coords, tile, options.maxAncestorLevels ?? 6)
          .then(() => done(null, tile))
          .catch(() => done(null, tile));
        return tile;
      },
    });
    return new CachedTileLayer(options);
  }

  async function drawCachedTile(layer, coords, canvas, maxAncestorLevels) {
    const cache = await caches.open(TILE_CACHE);
    for (let level = 0; level <= maxAncestorLevels && coords.z - level >= 0; level += 1) {
      const scale = 2 ** level;
      const ancestor = {
        z: coords.z - level,
        x: Math.floor(coords.x / scale),
        y: Math.floor(coords.y / scale),
      };
      const response = await cache.match(tileKey(layer, ancestor));
      if (!response) {
        continue;
      }
      const bitmap = await createImageBitmap(await response.blob());
      const sourceSize = bitmap.width / scale;
      const context = canvas.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(
        bitmap,
        (coords.x % scale) * sourceSize,
        (coords.y % scale) * sourceSize,
        sourceSize,
        sourceSize,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      bitmap.close?.();
      return true;
    }
    return false;
  }

  window.CampgroundlessOffline = {
    supported,
    basemaps,
    staleDays: STALE_DAYS,
    listPacks,
    savePack,
    deletePack,
    putData,
    getData,
    countTiles,
    tiles,
    tileRange,
    tileMercatorBounds,
    downloadTiles,
    storageSummary,
    requestPersistence,
    formatBytes,
    packAgeDays,
    createCachedTileLayer,
  };
})();
