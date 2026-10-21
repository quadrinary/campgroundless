// Offline areas: IndexedDB for pack metadata and vector data. Map tiles go to
// Cache Storage on the website and to native files in the iPhone app. Tiles are
// keyed by layer and z/x/y so they are shared between overlapping packs and never
// confused with live provider responses.
(() => {
  "use strict";

  const DB_NAME = "campgroundless-offline";
  const DB_VERSION = 1;
  const TILE_CACHE = "campgroundless-offline-tiles-v1";
  const TILE_ORIGIN = "https://offline-tiles.campgroundless.invalid";
  const STALE_DAYS = 30;
  const nativeApp = window.CampgroundlessNative;
  const fileSystem = nativeApp?.isNative ? nativeApp.plugin("Filesystem") : null;
  // Library/NoCloud: kept until deleted, excluded from iCloud backups.
  const FILE_DIRECTORY = "LIBRARY_NO_CLOUD";
  const FILE_ROOT = "offline-tiles";
  const OFFLINE_PROTOCOL = "cgoffline";
  const VECTOR_LAYER = "basemap:openfreemap";
  const VECTOR_ASSETS = "assets:openfreemap";
  // OpenFreeMap terms for offline use: at most 3,000 tiles or 50 MB per download,
  // at most 4 parallel requests, and a User-Agent naming the app (set natively).
  const OPENFREEMAP = {
    styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    maxRequests: 3000,
    maxBytes: 50 * 1024 * 1024,
    concurrency: 4,
    glyphRanges: ["0-255", "256-511", "8192-8447"],
  };

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
  if (fileSystem) {
    basemaps.openfreemap = {
      label: "OpenFreeMap streets",
      description: "Vector street map · up to 3,000 tiles and 50 MB per download (OpenFreeMap terms)",
      kind: "vector",
      maxNativeZoom: 14,
      averageTileBytes: 15000,
      maxRequests: OPENFREEMAP.maxRequests,
      maxBytes: OPENFREEMAP.maxBytes,
      concurrency: OPENFREEMAP.concurrency,
      attribution:
        '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> (saved offline)',
    };
  }

  const supported = Boolean(
    window.indexedDB && (fileSystem || (window.caches && window.isSecureContext)),
  );

  function safeSegment(text) {
    return String(text).replace(/[^a-z0-9._@-]/gi, "_");
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // Website: Cache Storage under synthetic URLs (unchanged from earlier builds so
  // existing saved areas keep working).
  let tileCachePromise;
  const cacheStore = {
    key: (layer, path) => `${TILE_ORIGIN}/${encodeURIComponent(layer)}/${path}`,
    cache() {
      tileCachePromise ??= caches.open(TILE_CACHE);
      return tileCachePromise;
    },
    async size(layer, path) {
      const response = await (await this.cache()).match(this.key(layer, path));
      return response ? Number(response.headers.get("X-Byte-Length")) || 0 : null;
    },
    async get(layer, path) {
      const response = await (await this.cache()).match(this.key(layer, path));
      return response ? response.blob() : null;
    },
    async put(layer, path, blob, type) {
      await (await this.cache()).put(
        this.key(layer, path),
        new Response(blob, { headers: { "Content-Type": type, "X-Byte-Length": String(blob.size) } }),
      );
    },
    async remove(layer, path) {
      await (await this.cache()).delete(this.key(layer, path));
    },
  };

  // iPhone app: one native file per tile, read back through the web view's file URLs.
  let rootUriPromise;
  const fileStore = {
    path: (layer, path) => `${FILE_ROOT}/${safeSegment(layer)}/${path}`,
    async url(layer, path) {
      rootUriPromise ??= fileSystem
        .getUri({ directory: FILE_DIRECTORY, path: FILE_ROOT })
        .then((result) => result.uri.replace(/\/$/, ""));
      return window.Capacitor.convertFileSrc(`${await rootUriPromise}/${safeSegment(layer)}/${path}`);
    },
    async size(layer, path) {
      try {
        const info = await fileSystem.stat({ directory: FILE_DIRECTORY, path: this.path(layer, path) });
        return Number(info.size) || 0;
      } catch {
        return null;
      }
    },
    async get(layer, path) {
      try {
        const response = await fetch(await this.url(layer, path));
        return response.ok ? await response.blob() : null;
      } catch {
        return null;
      }
    },
    async put(layer, path, blob) {
      await fileSystem.writeFile({
        directory: FILE_DIRECTORY,
        path: this.path(layer, path),
        data: await blobToBase64(blob),
        recursive: true,
      });
    },
    async remove(layer, path) {
      await fileSystem.deleteFile({ directory: FILE_DIRECTORY, path: this.path(layer, path) }).catch(() => {});
    },
  };

  const tileStore = fileSystem ? fileStore : cacheStore;

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
  const tilePath = ({ z, x, y }) => `${z}/${x}/${y}`;
  const tileKey = (layer, tile) => `${layer}/${tilePath(tile)}`;
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
        if (response.ok || response.status === 404 || response.status === 204) {
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
  const isImage = (type) => type.startsWith("image/");
  const isVectorTile = (type) => !/^text\/html|json/i.test(type);

  // `onBytes` lets callers enforce a provider's per-download size limit.
  async function downloadTiles({ layer, urlFor, bounds, minZoom, maxZoom, signal, onTile, onBytes, refresh = false, concurrency = 4, seen = null, vector = false }) {
    let bytes = 0;
    await runQueue(
      unseenTiles(layer, bounds, minZoom, maxZoom, seen),
      concurrency,
      async (tile) => {
        const path = tilePath(tile);
        const existing = refresh ? null : await tileStore.size(layer, path);
        if (existing !== null) {
          bytes += existing;
          onTile?.(existing);
          return;
        }
        const response = await fetchWithRetry(urlFor(tile), signal);
        if (response.status === 404 || response.status === 204) {
          onTile?.(0);
          return;
        }
        const type = response.headers.get("Content-Type") || "";
        if (!(vector ? isVectorTile(type) : isImage(type))) {
          throw new Error("A map provider returned an unexpected response instead of map data.");
        }
        const blob = await response.blob();
        onBytes?.(blob.size);
        await tileStore.put(layer, path, blob, type);
        bytes += blob.size;
        onTile?.(blob.size);
      },
      signal,
    );
    return bytes;
  }

  // --- OpenFreeMap vector basemap (iPhone app only) ---
  let vectorTileTemplate = null;

  function fontStacks(style) {
    const stacks = new Set();
    const visit = (value) => {
      if (Array.isArray(value)) {
        if (value.length && value.every((item) => typeof item === "string") && !/^[a-z-]+$/.test(value[0])) {
          stacks.add(value.join(","));
          return;
        }
        value.forEach(visit);
      }
    };
    (style.layers ?? []).forEach((layer) => {
      if (layer.layout?.["text-font"]) {
        visit(layer.layout["text-font"]);
      }
    });
    if (!stacks.size) {
      stacks.add("Noto Sans Regular");
    }
    return [...stacks];
  }

  // Saves the style, sprites and fonts and remembers the tile URL. Returns the
  // number of requests and bytes used so the caller can stay within the terms.
  async function prepareVectorBasemap({ signal, onBytes }) {
    let requests = 0;
    let bytes = 0;
    const get = async (url, kind) => {
      requests += 1;
      const response = await fetchWithRetry(url, signal);
      if (!response.ok) {
        throw new Error(`OpenFreeMap ${kind} request failed (${response.status}).`);
      }
      const blob = await response.blob();
      bytes += blob.size;
      onBytes?.(blob.size);
      return blob;
    };
    const style = JSON.parse(await (await get(OPENFREEMAP.styleUrl, "style")).text());
    const sources = {};
    for (const [name, source] of Object.entries(style.sources ?? {})) {
      if (source.type !== "vector") {
        continue;
      }
      const tileJson = source.url ? JSON.parse(await (await get(source.url, "tile index")).text()) : source;
      const template = tileJson.tiles?.[0];
      if (!template) {
        continue;
      }
      vectorTileTemplate = template;
      sources[name] = {
        type: "vector",
        tiles: [`${OFFLINE_PROTOCOL}://tiles/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: Math.min(14, tileJson.maxzoom ?? 14),
        attribution: tileJson.attribution ?? source.attribution,
      };
      break;
    }
    if (!vectorTileTemplate) {
      throw new Error("OpenFreeMap did not describe its vector tiles.");
    }
    const glyphUrls = [];
    if (typeof style.glyphs === "string") {
      fontStacks(style).forEach((stack) => {
        OPENFREEMAP.glyphRanges.forEach((range) => {
          glyphUrls.push([
            `glyphs/${safeSegment(stack)}/${range}.pbf`,
            style.glyphs.replace("{fontstack}", encodeURIComponent(stack)).replace("{range}", range),
          ]);
        });
      });
    }
    const spriteBase = typeof style.sprite === "string" ? style.sprite : null;
    const spriteUrls = spriteBase
      ? ["", "@2x"].flatMap((ratio) => [".json", ".png"].map((ext) => [`sprite/sprite${ratio}${ext}`, `${spriteBase}${ratio}${ext}`]))
      : [];
    await runQueue(
      [...spriteUrls, ...glyphUrls],
      OPENFREEMAP.concurrency,
      async ([path, url]) => {
        try {
          await tileStore.put(VECTOR_ASSETS, path, await get(url, "asset"), "application/octet-stream");
        } catch (error) {
          // Missing font ranges only hide some labels; missing sprites hide icons.
          if (signal?.aborted || path.startsWith("sprite/")) {
            throw error;
          }
        }
      },
      signal,
    );
    const offlineStyle = {
      ...style,
      sources,
      glyphs: `${OFFLINE_PROTOCOL}://glyphs/{fontstack}/{range}.pbf`,
      sprite: spriteBase ? `${OFFLINE_PROTOCOL}://sprite/sprite` : undefined,
      layers: (style.layers ?? []).filter((layer) => !layer.source || sources[layer.source]),
    };
    if (!offlineStyle.sprite) {
      delete offlineStyle.sprite;
    }
    await tileStore.put(
      VECTOR_ASSETS,
      "style.json",
      new Blob([JSON.stringify(offlineStyle)], { type: "application/json" }),
      "application/json",
    );
    return { requests, bytes };
  }

  // Requests the style/tiles/fonts would need besides tiles, used for estimates.
  const vectorAssetRequests = () => 2 + 4 + 3 * OPENFREEMAP.glyphRanges.length;

  function vectorTileUrl({ z, x, y }) {
    if (!vectorTileTemplate) {
      throw new Error("The vector map was not prepared.");
    }
    return vectorTileTemplate.replace("{z}", z).replace("{x}", x).replace("{y}", y);
  }

  async function savedVectorStyle() {
    const blob = await tileStore.get(VECTOR_ASSETS, "style.json");
    return blob ? JSON.parse(await blob.text()) : null;
  }

  let protocolRegistered = false;
  function registerOfflineProtocol() {
    if (protocolRegistered || !window.maplibregl?.addProtocol) {
      return;
    }
    protocolRegistered = true;
    window.maplibregl.addProtocol(OFFLINE_PROTOCOL, async (params) => {
      const [kind, ...rest] = params.url.slice(`${OFFLINE_PROTOCOL}://`.length).split("/");
      const parts = rest.map((part) => decodeURIComponent(part));
      let blob = null;
      if (kind === "tiles") {
        blob = await tileStore.get(VECTOR_LAYER, parts.join("/"));
      } else if (kind === "glyphs") {
        blob = await tileStore.get(VECTOR_ASSETS, `glyphs/${safeSegment(parts[0])}/${parts[1]}`);
      } else if (kind === "sprite") {
        blob = await tileStore.get(VECTOR_ASSETS, `sprite/${parts.join("/")}`);
        if (!blob) {
          throw new Error("Saved map icons are missing.");
        }
      }
      if (params.type === "json") {
        return { data: blob ? JSON.parse(await blob.text()) : {} };
      }
      // Areas outside saved packs draw as empty tiles instead of errors.
      return { data: blob ? await blob.arrayBuffer() : new ArrayBuffer(0) };
    });
  }

  async function createVectorBasemapLayer(options = {}) {
    const style = await savedVectorStyle();
    if (!style || !L.maplibreGL) {
      return null;
    }
    registerOfflineProtocol();
    return L.maplibreGL({ style, ...options });
  }

  // Removes a pack and any cached tiles no other pack still needs.
  async function deletePack(pack) {
    const others = (await listPacks()).filter((entry) => entry.id !== pack.id);
    if (fileSystem || window.caches) {
      for (const [layer, range] of Object.entries(pack.tileLayers ?? {})) {
        await runQueue(tiles(pack.bounds, range.minZoom, range.maxZoom), fileSystem ? 8 : 16, async (tile) => {
          if (!others.some((other) => tileInPack(other, layer, tile))) {
            await tileStore.remove(layer, tilePath(tile));
          }
        });
      }
      if (pack.basemap === "openfreemap" && !others.some((other) => other.basemap === "openfreemap")) {
        if (fileSystem) {
          await fileSystem
            .rmdir({ directory: FILE_DIRECTORY, path: fileStore.path(VECTOR_ASSETS, "").replace(/\/$/, ""), recursive: true })
            .catch(() => {});
        }
      }
    }
    await transact("data", "readwrite", (store) =>
      store.delete(IDBKeyRange.bound(`${pack.id}:`, `${pack.id}:\uffff`)),
    );
    await transact("packs", "readwrite", (store) => store.delete(pack.id));
  }

  async function storageSummary() {
    if (fileSystem) {
      // Saved tiles live in app files, which the browser storage estimate ignores.
      const info = await nativeApp.plugin("Device")?.getInfo?.().catch(() => null);
      const usage = (await listPacks().catch(() => [])).reduce((sum, pack) => sum + (pack.bytes || 0), 0);
      const free = Number(info?.realDiskFree ?? info?.diskFree);
      return {
        usage,
        quota: Number.isFinite(free) && free > 0 ? usage + free : null,
        persisted: true,
        native: true,
      };
    }
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
    for (let level = 0; level <= maxAncestorLevels && coords.z - level >= 0; level += 1) {
      const scale = 2 ** level;
      const ancestor = {
        z: coords.z - level,
        x: Math.floor(coords.x / scale),
        y: Math.floor(coords.y / scale),
      };
      const blob = await tileStore.get(layer, tilePath(ancestor));
      if (!blob) {
        continue;
      }
      const bitmap = await createImageBitmap(blob);
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
    native: Boolean(fileSystem),
    vector: {
      layer: VECTOR_LAYER,
      maxRequests: OPENFREEMAP.maxRequests,
      maxBytes: OPENFREEMAP.maxBytes,
      concurrency: OPENFREEMAP.concurrency,
      assetRequests: vectorAssetRequests,
      prepare: prepareVectorBasemap,
      tileUrl: vectorTileUrl,
      createLayer: createVectorBasemapLayer,
    },
  };
})();
