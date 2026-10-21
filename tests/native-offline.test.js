// Tests the native bridge and offline storage in a simulated web view.
// Run with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const webDir = path.join(__dirname, "..", "web");
const source = (file) => fs.readFileSync(path.join(webDir, file), "utf8");

class FakeFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString("base64")}`;
      this.onload();
    });
  }
}

function makeFilesystem() {
  const files = new Map();
  return {
    files,
    async getUri({ path: filePath }) {
      return { uri: `file:///app/Library/NoCloud/${filePath}` };
    },
    async writeFile({ path: filePath, data, directory }) {
      assert.equal(directory, "LIBRARY_NO_CLOUD");
      files.set(filePath, Buffer.from(data, "base64"));
    },
    async stat({ path: filePath }) {
      if (!files.has(filePath)) throw new Error("File does not exist");
      return { size: files.get(filePath).length };
    },
    async deleteFile({ path: filePath }) {
      files.delete(filePath);
    },
    async rmdir({ path: dir }) {
      [...files.keys()].filter((key) => key.startsWith(`${dir}/`)).forEach((key) => files.delete(key));
    },
  };
}

function makeContext({ native, plugins = {}, fetchImpl, href = "capacitor://localhost/index.html" }) {
  const listeners = {};
  const documentElement = {
    dataset: { theme: "light" },
    classList: { added: new Set(), add(name) { this.added.add(name); } },
  };
  const window = {
    location: { href },
    matchMedia: () => ({ matches: false }),
    open: () => {},
    indexedDB: {},
    isSecureContext: true,
    caches: native ? undefined : {},
  };
  if (native) {
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: plugins,
      convertFileSrc: (uri) => uri.replace("file://", "capacitor://localhost/_capacitor_file_"),
    };
  }
  const context = {
    window,
    document: {
      documentElement,
      addEventListener: (type, fn) => ((listeners[type] ??= []).push(fn)),
    },
    navigator: {},
    MutationObserver: class { observe() {} },
    URL,
    Blob,
    Response,
    DOMException,
    FileReader: FakeFileReader,
    setTimeout,
    console,
  };
  context.fetch = fetchImpl ?? (async () => new Response("", { status: 404 }));
  vm.createContext(context);
  vm.runInContext(source("native.js"), context);
  vm.runInContext(source("offline.js"), context);
  return context;
}

test("website keeps browser behavior", () => {
  const { window } = makeContext({ native: false, href: "https://quadrinary.github.io/campgroundless/?x=1#a" });
  assert.equal(window.CampgroundlessNative.isNative, false);
  assert.equal(window.CampgroundlessNative.publicUrl(window.location.href), "https://quadrinary.github.io/campgroundless/?x=1#a");
  assert.equal(window.CampgroundlessOffline.basemaps.openfreemap, undefined, "OpenFreeMap offline is app-only");
  assert.equal(window.CampgroundlessOffline.native, false);
});

test("app share links point at the public website", () => {
  const { window, document } = makeContext({ native: true });
  const { publicUrl, isNative } = window.CampgroundlessNative;
  assert.equal(isNative, true);
  assert.ok(document.documentElement.classList.added.has("is-native"));
  assert.equal(
    publicUrl("capacitor://localhost/index.html#shared-note=abc"),
    "https://quadrinary.github.io/campgroundless/#shared-note=abc",
  );
  assert.equal(publicUrl("capacitor://localhost/"), "https://quadrinary.github.io/campgroundless/");
  assert.equal(publicUrl("capacitor://localhost/settings.html"), "https://quadrinary.github.io/campgroundless/settings.html");
});

test("app routes geolocation through the native plugin", async () => {
  const calls = [];
  const geo = {
    async getCurrentPosition(options) {
      calls.push(options);
      return { coords: { latitude: 37, longitude: -120, accuracy: 5 }, timestamp: 1 };
    },
  };
  const context = makeContext({ native: true, plugins: { Geolocation: geo } });
  context.navigator.geolocation = {};
  // Re-run so the shim sees navigator.geolocation.
  vm.runInContext(source("native.js"), context);
  const position = await new Promise((resolve, reject) =>
    context.navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true }),
  );
  assert.equal(position.coords.latitude, 37);
  assert.equal(calls[0].enableHighAccuracy, true);
});

test("app stores tiles as native files and reads them back", async () => {
  const filesystem = makeFilesystem();
  const context = makeContext({
    native: true,
    plugins: { Filesystem: filesystem },
    fetchImpl: async () => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "image/png" } }),
  });
  const offline = context.window.CampgroundlessOffline;
  assert.equal(offline.supported, true);
  assert.equal(offline.native, true);
  const bounds = { west: -120.01, east: -120, south: 37, north: 37.01 };
  const bytes = await offline.downloadTiles({
    layer: "basemap:usgs-topo",
    urlFor: () => "https://example.test/tile.png",
    bounds,
    minZoom: 10,
    maxZoom: 10,
  });
  assert.equal(bytes, 4);
  const [stored] = [...filesystem.files.keys()];
  assert.match(stored, /^offline-tiles\/basemap_usgs-topo\/10\/\d+\/\d+$/);

  // A second pass reuses the saved file without fetching.
  let fetched = 0;
  context.fetch = async () => {
    fetched += 1;
    return new Response("", { status: 500 });
  };
  const again = await offline.downloadTiles({
    layer: "basemap:usgs-topo",
    urlFor: () => "https://example.test/tile.png",
    bounds,
    minZoom: 10,
    maxZoom: 10,
  });
  assert.equal(again, 4);
  assert.equal(fetched, 0);
});

test("OpenFreeMap download follows the offline terms", async () => {
  const filesystem = makeFilesystem();
  let active = 0;
  let peak = 0;
  const requested = [];
  const style = {
    version: 8,
    sources: {
      openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
      ne2_shaded: { type: "raster", tiles: ["https://tiles.openfreemap.org/natural_earth/{z}/{x}/{y}.png"] },
    },
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sprite: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
    layers: [
      { id: "bg", type: "background" },
      { id: "relief", type: "raster", source: "ne2_shaded" },
      { id: "roads", type: "line", source: "openmaptiles" },
      { id: "labels", type: "symbol", source: "openmaptiles", layout: { "text-font": ["Noto Sans Regular"] } },
      { id: "bold", type: "symbol", source: "openmaptiles", layout: { "text-font": ["literal", ["Noto Sans Bold"]] } },
    ],
  };
  const context = makeContext({
    native: true,
    plugins: { Filesystem: filesystem },
    fetchImpl: async (url) => {
      url = String(url);
      requested.push(url);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (url.endsWith("/styles/liberty")) return new Response(JSON.stringify(style));
      if (url.endsWith("/planet")) {
        return new Response(JSON.stringify({ tiles: ["https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf"], maxzoom: 14 }));
      }
      if (url.includes("/planet/v1/")) {
        return new Response(new Uint8Array(1000), { headers: { "Content-Type": "application/x-protobuf" } });
      }
      return new Response(new Uint8Array(10), { headers: { "Content-Type": "application/octet-stream" } });
    },
  });
  const offline = context.window.CampgroundlessOffline;
  const definition = offline.basemaps.openfreemap;
  assert.ok(definition, "OpenFreeMap offline is offered in the app");
  assert.equal(definition.maxRequests, 3000);
  assert.equal(definition.maxBytes, 50 * 1024 * 1024);
  assert.equal(definition.concurrency, 4);

  let counted = 0;
  const prepared = await offline.vector.prepare({ onBytes: (size) => (counted += size) });
  assert.ok(prepared.requests <= offline.vector.assetRequests(), `${prepared.requests} asset requests`);
  const savedStyle = JSON.parse(filesystem.files.get("offline-tiles/assets_openfreemap/style.json").toString());
  assert.deepEqual(Object.keys(savedStyle.sources), ["openmaptiles"]);
  assert.equal(savedStyle.sources.openmaptiles.tiles[0], "cgoffline://tiles/{z}/{x}/{y}");
  assert.equal(savedStyle.glyphs, "cgoffline://glyphs/{fontstack}/{range}.pbf");
  assert.ok(!savedStyle.layers.some((layer) => layer.source === "ne2_shaded"));
  assert.ok(filesystem.files.has("offline-tiles/assets_openfreemap/glyphs/Noto_Sans_Bold/0-255.pbf"));
  assert.ok(filesystem.files.has("offline-tiles/assets_openfreemap/glyphs/Noto_Sans_Regular/8192-8447.pbf"));
  assert.ok(filesystem.files.has("offline-tiles/assets_openfreemap/sprite/sprite@2x.png"));
  assert.equal(offline.vector.tileUrl({ z: 14, x: 1, y: 2 }), "https://tiles.openfreemap.org/planet/v1/14/1/2.pbf");

  await offline.downloadTiles({
    layer: offline.vector.layer,
    urlFor: offline.vector.tileUrl,
    bounds: { west: -120.2, east: -120, south: 37, north: 37.2 },
    minZoom: 12,
    maxZoom: 14,
    vector: true,
    concurrency: definition.concurrency,
    onBytes: (size) => (counted += size),
  });
  assert.ok(peak <= 4, `peak parallel requests ${peak}`);
  assert.ok(counted > 1000);
  assert.ok(requested.every((url) => !url.includes("natural_earth")), "unused raster source is not downloaded");
  assert.ok([...filesystem.files.keys()].some((key) => key.startsWith("offline-tiles/basemap_openfreemap/14/")));
});

test("byte limit callback can stop a download", async () => {
  const filesystem = makeFilesystem();
  const context = makeContext({
    native: true,
    plugins: { Filesystem: filesystem },
    fetchImpl: async () => new Response(new Uint8Array(1000), { headers: { "Content-Type": "application/x-protobuf" } }),
  });
  const offline = context.window.CampgroundlessOffline;
  let total = 0;
  await assert.rejects(
    offline.downloadTiles({
      layer: offline.vector.layer,
      urlFor: () => "https://tiles.openfreemap.org/planet/v1/1/1/1.pbf",
      bounds: { west: -120.2, east: -120, south: 37, north: 37.2 },
      minZoom: 14,
      maxZoom: 14,
      vector: true,
      onBytes: (size) => {
        total += size;
        if (total > 5000) throw new Error("over limit");
      },
    }),
    /over limit/,
  );
  assert.ok(filesystem.files.size <= 8, "stops soon after the limit");
});
