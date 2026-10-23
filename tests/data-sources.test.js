// Tests selectable land-data and place-search sources.
// Run with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const webDir = path.join(__dirname, "..", "web");
const source = (file) => fs.readFileSync(path.join(webDir, file), "utf8");

function load(files, saved) {
  const storage = new Map();
  if (saved) storage.set("campgroundless.settings.v1", JSON.stringify(saved));
  const window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
    document: { getElementById: () => null, documentElement: { style: { setProperty() {} } } },
  };
  window.window = window;
  const context = vm.createContext({ ...window, window, URL, structuredClone });
  files.forEach((file) => vm.runInContext(source(file), context));
  return { window: context.window, storage };
}

test("PAD-US 4.1 and Nominatim are the defaults", () => {
  const { window } = load(["settings-store.js"]);
  const settings = window.CampgroundlessSettings.read();
  assert.equal(settings.dataSource, "padus");
  assert.equal(settings.placeSearchProvider, "nominatim");
});

test("saved sources are kept, migrated, or reset", () => {
  const read = (saved) => load(["settings-store.js"], saved).window.CampgroundlessSettings.read();
  assert.equal(read({ dataSource: "padus3" }).dataSource, "padus3");
  assert.equal(read({ dataSource: "custom" }).dataSource, "custom");
  assert.equal(read({ dataSource: "nonsense" }).dataSource, "padus");
  assert.equal(read({ placeSearchProvider: "photon" }).placeSearchProvider, "photon");
  assert.equal(read({ placeSearchUrl: "https://nominatim.openstreetmap.org/search" }).placeSearchProvider, "nominatim");
  // A changed endpoint saved before providers existed becomes a custom provider.
  assert.equal(read({ placeSearchUrl: "https://geo.example.com/search" }).placeSearchProvider, "custom");
});

test("place search requests target the chosen provider", () => {
  const { window } = load(["place-search.js"]);
  const search = window.CampgroundlessPlaceSearch;
  const nominatim = search.buildRequest("nominatim", "https://ignored.example.com/", "Moab");
  assert.equal(nominatim.origin, "https://nominatim.openstreetmap.org");
  assert.equal(nominatim.searchParams.get("format"), "jsonv2");
  assert.equal(nominatim.searchParams.get("viewbox"), "-124.8,49.1,-93.5,25.8");
  const photon = search.buildRequest("photon", "", "Moab");
  assert.equal(photon.origin + photon.pathname, "https://photon.komoot.io/api/");
  assert.equal(photon.searchParams.get("bbox"), "-124.8,25.8,-93.5,49.1");
  const custom = search.buildRequest("custom", "https://geo.example.com/search", "Moab");
  assert.equal(custom.host, "geo.example.com");
});

test("Photon results are converted to Nominatim-shaped places", () => {
  const { window } = load(["place-search.js"]);
  const places = window.CampgroundlessPlaceSearch.parseResponse("photon", {
    features: [
      {
        geometry: { coordinates: [-109.55, 38.57] },
        properties: { name: "Moab", osm_key: "place", osm_value: "city", county: "Grand", state: "Utah", countrycode: "US", country: "United States" },
      },
      {
        geometry: { coordinates: [-109.56, 38.58] },
        properties: { name: "Moab", osm_key: "place", osm_value: "town", county: "Grand", state: "Utah", countrycode: "US", country: "United States" },
      },
      { geometry: { coordinates: [-114, 51] }, properties: { name: "Banff", countrycode: "CA" } },
      { geometry: {}, properties: { name: "No point" } },
    ],
  });
  assert.equal(places.length, 1);
  assert.equal(places[0].lat, "38.57");
  assert.equal(places[0].lon, "-109.55");
  assert.equal(places[0].display_name, "Moab, Grand, Utah, United States");
  assert.equal(places[0].type, "city");
  assert.throws(() => window.CampgroundlessPlaceSearch.parseResponse("photon", []), /unsupported/);
  assert.throws(() => window.CampgroundlessPlaceSearch.parseResponse("nominatim", {}), /unsupported/);
});

test("backups drop unknown source values", () => {
  const { window } = load(["settings-store.js", "backup.js"]);
  const backup = window.CampgroundlessBackup.parse(
    JSON.stringify({
      format: "campgroundless-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: { dataSource: "elsewhere", placeSearchProvider: "photon" },
    }),
  );
  assert.equal("dataSource" in backup.settings, false);
  assert.equal(backup.settings.placeSearchProvider, "photon");
});
