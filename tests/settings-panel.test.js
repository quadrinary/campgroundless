// Tests the Settings panel's live-apply routing and Advanced validation.
// Run with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const webDir = path.join(__dirname, "..", "web");
const source = (file) => fs.readFileSync(path.join(webDir, file), "utf8");

function loadPanel() {
  const storage = new Map();
  const window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    document: {
      getElementById: () => null,
      documentElement: { style: { setProperty() {} } },
    },
  };
  window.window = window;
  const context = vm.createContext({ ...window, window, URL, structuredClone });
  vm.runInContext(source("settings-store.js"), context);
  vm.runInContext(source("settings.js"), context);
  return context.window.CampgroundlessSettingsPanel;
}

function recordingApi() {
  const calls = [];
  return {
    calls,
    setBasemap: (value) => calls.push(["setBasemap", value]),
    setManagerLayer: (name, on) => calls.push(["setManagerLayer", name, on]),
    update: (patch) => {
      calls.push(["update", patch]);
      return true;
    },
  };
}

const validAdvanced = {
  dataSource: "padus",
  dataUrl: "",
  placeSearchUrl: "https://nominatim.openstreetmap.org/search",
  basemapUrl: "",
};

test("Map and Display controls apply to the live map", () => {
  const panel = loadPanel();
  const api = recordingApi();
  panel.applyControl("basemap", "osm:hot", api);
  panel.applyControl("settingsLayer", { name: "blm", checked: false }, api);
  panel.applyControl("recreationSitesMinZoom", "13", api);
  panel.applyControl("theme", "dark", api);
  panel.applyControl("showLandDisclaimer", false, api);
  panel.applyControl("typography", { body: 14, search: 11, caption: 10 }, api);
  assert.deepEqual(JSON.parse(JSON.stringify(api.calls)), [
    ["setBasemap", "osm:hot"],
    ["setManagerLayer", "blm", false],
    ["update", { recreationSitesMinZoom: 13 }],
    ["update", { theme: "dark" }],
    ["update", { showLandDisclaimer: false }],
    ["update", { typography: { body: 14, search: 11, caption: 10 } }],
  ]);
});

test("a failed save is reported to the panel", () => {
  const panel = loadPanel();
  const api = { ...recordingApi(), update: () => false };
  assert.equal(panel.applyControl("popupClickBehavior", "replace", api), false);
});

test("Advanced settings accept the defaults", () => {
  const panel = loadPanel();
  assert.doesNotThrow(() => panel.validateAdvanced(validAdvanced));
});

test("Advanced settings reject an unusable custom data source", () => {
  const panel = loadPanel();
  assert.throws(() => panel.validateAdvanced({ ...validAdvanced, dataSource: "custom" }), /Enter a Feature Layer URL/);
  assert.throws(
    () => panel.validateAdvanced({ ...validAdvanced, dataSource: "custom", dataUrl: "https://example.com/arcgis/rest/services/x/MapServer/0" }),
    /FeatureServer/,
  );
  assert.doesNotThrow(() =>
    panel.validateAdvanced({ ...validAdvanced, dataSource: "custom", dataUrl: "https://example.com/arcgis/rest/services/x/FeatureServer/0" }),
  );
});

test("Advanced settings reject incomplete tile templates and bad endpoints", () => {
  const panel = loadPanel();
  assert.throws(() => panel.validateAdvanced({ ...validAdvanced, basemapUrl: "https://t.example.com/{z}/{x}.png" }), /\{z\}, \{x\}, and \{y\}/);
  assert.doesNotThrow(() => panel.validateAdvanced({ ...validAdvanced, basemapUrl: "https://t.example.com/{z}/{x}/{y}.png?key={apiKey}" }));
  assert.throws(() => panel.validateAdvanced({ ...validAdvanced, placeSearchUrl: "not a url" }));
});
