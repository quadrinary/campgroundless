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

test("land categories split the old state and other groups", () => {
  const read = (saved) => load(["settings-store.js"], saved).window.CampgroundlessSettings.read();
  const defaults = read().layers;
  const specialDesignations = ["wilderness", "wsa", "acec", "wsr"];
  Object.entries(defaults).forEach(([key, on]) => assert.equal(on, !specialDesignations.includes(key), key));
  // Settings saved before the split carry their state/other choice to every new category.
  const migrated = read({ layers: { forest: true, blm: false, state: false, other: true } }).layers;
  assert.equal(migrated.blm, false);
  ["stateTrust", "stateParks", "stateWildlife", "state", "regional", "county", "city"].forEach((key) =>
    assert.equal(migrated[key], false, key));
  ["nps", "monuments", "fws", "usbr", "usace", "military", "doe", "otherFederal"].forEach((key) =>
    assert.equal(migrated[key], true, key));
  assert.equal("other" in migrated, false);
  specialDesignations.forEach((key) => assert.equal(migrated[key], false, key));
  // New-format settings keep "state" as its own category.
  const current = read({ layers: { state: false, stateTrust: true, nps: false } }).layers;
  assert.equal(current.state, false);
  assert.equal(current.stateTrust, true);
  assert.equal(current.nps, false);
  assert.equal(current.county, true);
});

test("every land category has a saved setting and known manager codes", () => {
  const { window } = load(["settings-store.js"]);
  const layerKeys = Object.keys(window.CampgroundlessSettings.defaults.layers).sort();
  const app = source("app.js");
  const categoryKeys = [...app.matchAll(/\{ key: "(\w+)", section: "(federal|state|designations)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(categoryKeys, layerKeys);
  const managerNames = app.slice(app.indexOf("const managerNames = {"), app.indexOf("// Agency logos"));
  const codes = [...app.matchAll(/managers: \[([^\]]+)\]/g)]
    .flatMap((match) => match[1].match(/"(\w+)"/g).map((code) => code.slice(1, -1)));
  assert.ok(codes.includes("SLB"), "state trust lands are mapped");
  codes.forEach((code) => assert.match(managerNames, new RegExp(`\\b${code}: "`), `${code} has a display name`));
});

test("every reference overlay has a saved setting and live data is never saved offline", () => {
  const { window } = load(["settings-store.js"]);
  const overlayKeys = Object.keys(window.CampgroundlessSettings.defaults.overlays).sort();
  const app = source("app.js");
  const block = app.slice(app.indexOf("const overlayDefinitions = {"), app.indexOf("const overlayRefreshTimers"));
  const definitionKeys = [...block.matchAll(/^      (\w+): \{$/gm)].map((match) => match[1]).sort();
  assert.deepEqual(definitionKeys, overlayKeys);
  for (const key of ["wildfirePerimeters", "smoke"]) {
    const start = block.indexOf(`      ${key}: {`);
    assert.match(block.slice(start, block.indexOf("\n      },", start)), /liveOnly: true/, `${key} is live only`);
  }
  assert.match(app, /return Boolean\(definition\) && !definition\.liveOnly/);
});

test("every agency logo is bundled and cached for offline use", () => {
  const app = source("app.js");
  const block = app.slice(app.indexOf("const managerLogos = {"), app.indexOf("};", app.indexOf("const managerLogos = {")));
  const logos = [...block.matchAll(/(\w+): "(logos\/[\w.]+)"/g)].map((match) => [match[1], match[2]]);
  assert.ok(logos.some(([code]) => code === "DOE"), "Department of Energy has a logo");
  const sw = source("sw.js");
  logos.forEach(([code, file]) => {
    assert.ok(fs.existsSync(path.join(webDir, file)), `${code} logo file exists`);
    assert.ok(sw.includes(`"./${file}"`), `${code} logo is precached`);
  });
});

function loadStateLandIcons() {
  const app = source("app.js");
  const grab = (start, end) => {
    const from = app.indexOf(start);
    return app.slice(from, app.indexOf(end, from));
  };
  const code = [
    grab("  const coverageStates = [", "  const coverageStateCodes"),
    grab("  const landCategories = [", "  const landCategorySections"),
    grab("  const stateLandSymbols", "  const blmRecreationTypes"),
    "function escapeHtml(value) { return String(value); }",
    "this.icon = stateLandIconMarkup; this.coverageStates = coverageStates; this.landCategories = landCategories;",
  ].join("\n");
  const context = vm.createContext({ window: {} });
  vm.runInContext(source("state-outlines.js"), context);
  vm.runInContext(code, context);
  return context;
}

test("state and local land get a project-drawn state icon", () => {
  const { icon, coverageStates, landCategories, window } = loadStateLandIcons();
  coverageStates.forEach(({ abbreviation }) =>
    assert.ok(window.CampgroundlessStateOutlines[abbreviation]?.path, `${abbreviation} has an outline`));
  landCategories
    .filter((category) => category.section === "state")
    .forEach((category) => {
      category.managers.forEach((manager) => {
        const markup = icon(manager, "CA");
        assert.match(markup, /class="state-land-outline" d="M/, `${manager} uses the state outline`);
        assert.match(markup, /aria-label="California /, `${manager} has a label`);
        assert.match(markup, new RegExp(`fill="${category.color}"`), `${manager} uses its map color`);
      });
    });
  // An unknown state still shows the category symbol in a plain badge.
  assert.match(icon("SPR", "ZZ"), /<rect class="state-land-outline"/);
  assert.match(icon("CNTY", undefined), /aria-label="county icon"/);
  // Federal managers keep their own logos.
  assert.equal(icon("BLM", "CA"), "");
  assert.match(source("index.html"), /state-outlines\.js\?v=\d+"><\/script>\s*<script src="\.\/app\.js/);
});

test("monument labels drop the designation suffix from the name", () => {
  const app = source("app.js");
  const start = app.indexOf("  function designationLabelText");
  const end = app.indexOf("  function outerRings");
  assert.ok(start > 0 && end > start);
  const context = vm.createContext({});
  vm.runInContext(`${app.slice(start, end)}; this.designationLabelText = designationLabelText;`, context);
  const monument = { suffix: /\s+National Monument\b/i, type: "National Monument" };
  const military = { type: "Military land" };
  const label = context.designationLabelText;
  assert.equal(label("Mojave Trails National Monument", monument), "Mojave Trails");
  assert.equal(label("Sand to Snow National Monument", monument), "Sand to Snow");
  assert.equal(label("Cesar E. Chavez", monument), "Cesar E. Chavez");
  assert.equal(label("", monument), "National Monument");
  assert.equal(label("Fort Irwin National Training Center", military), "Fort Irwin National Training Center");
  assert.equal(label("", military), "Military land");
});
