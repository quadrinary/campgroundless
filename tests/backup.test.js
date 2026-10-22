// Tests the backup file format: export, parsing/validation, and merge/replace import.
// Run with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const webDir = path.join(__dirname, "..", "web");
const source = (file) => fs.readFileSync(path.join(webDir, file), "utf8");

const keys = {
  settings: "campgroundless.settings.v1",
  notes: "campgroundless.map-notes.v1",
  recent: "campgroundless.recent-searches.v1",
};

function load(initial = {}) {
  const storage = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  const window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
  window.window = window;
  const context = vm.createContext({ ...window, window, URL, structuredClone });
  vm.runInContext(source("settings-store.js"), context);
  vm.runInContext(source("backup.js"), context);
  const read = (key) => JSON.parse(storage.get(key) ?? "null");
  return { Backup: context.window.CampgroundlessBackup, Settings: context.window.CampgroundlessSettings, read };
}

const note = (id, updatedAt, extra = {}) => ({
  id,
  lat: 38.5,
  lng: -120.2,
  title: `Note ${id}`,
  icon: "camp",
  body: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
  ...extra,
});

const backupText = (data) => JSON.stringify({ format: "campgroundless-backup", version: 1, ...data });

test("export leaves out API keys unless asked", () => {
  const { Backup } = load({ [keys.settings]: { esriApiKey: "secret", basemap: "esri-topo" } });
  const plain = JSON.parse(JSON.stringify(Backup.create({}, { build: "1" })));
  assert.equal(plain.format, "campgroundless-backup");
  assert.equal(plain.version, 1);
  assert.equal(plain.includesApiKeys, false);
  assert.equal("esriApiKey" in plain.settings, false);
  assert.equal(plain.settings.basemap, "esri-topo");
  assert.deepEqual(plain.notes, []);

  const withKeys = Backup.create({ apiKeys: true });
  assert.equal(withKeys.includesApiKeys, true);
  assert.equal(withKeys.settings.esriApiKey, "secret");
});

test("export includes only the chosen parts", () => {
  const { Backup } = load({ [keys.notes]: [note("a", "2026-01-01T00:00:00Z")] });
  const backup = Backup.create({ settings: false, recent: false });
  assert.equal("settings" in backup, false);
  assert.equal("recentSearches" in backup, false);
  assert.equal(backup.notes.length, 1);
});

test("parse rejects files that are not usable backups", () => {
  const { Backup } = load();
  assert.throws(() => Backup.parse(""), /empty/);
  assert.throws(() => Backup.parse("{nope"), /Import locations/);
  assert.throws(() => Backup.parse(JSON.stringify({ format: "other" })), /not a Campgroundless backup/);
  assert.throws(() => Backup.parse(backupText({ version: 2, notes: [] })), /newer version/);
  assert.throws(() => Backup.parse(backupText({})), /does not contain/);
  assert.throws(() => Backup.parse(backupText({ notes: {} })), /not readable/);
  assert.throws(
    () => Backup.parse(backupText({ settings: { placeSearchUrl: "http://example.com/search" } })),
    /HTTPS/i,
  );
});

test("parse keeps known settings and valid entries only", () => {
  const { Backup } = load();
  const backup = Backup.parse(
    backupText({
      settings: { basemap: "esri-topo", bogus: true },
      notes: [note("a", "2026-01-01T00:00:00Z", { extra: "x" }), { id: "broken" }],
      recentSearches: [{ term: "Tahoe", at: "2026-01-01T00:00:00Z" }, { term: 5 }],
    }),
  );
  assert.deepEqual([...Object.keys(backup.settings)], ["basemap"]);
  assert.equal(backup.includesApiKeys, false);
  assert.equal(backup.notes.length, 1);
  assert.equal("extra" in backup.notes[0], false);
  const withDetails = Backup.parse(backupText({ notes: [note("d", "2026-01-01T00:00:00Z", { details: "<p>Saved</p>" })] }));
  assert.equal(withDetails.notes[0].details, "<p>Saved</p>");
  assert.equal(backup.skippedNotes, 1);
  assert.equal(backup.recentSearches.length, 1);
});

test("changed endpoints are reported for review", () => {
  const { Backup } = load();
  const backup = Backup.parse(backupText({ settings: { placeSearchUrl: "https://other.example.com/search" } }));
  const changed = Backup.changedEndpoints(backup);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].field, "placeSearchUrl");
  assert.equal(Backup.changedEndpoints(Backup.parse(backupText({ settings: { basemap: "esri-topo" } }))).length, 0);
});

test("merge keeps the most recently edited note and all others", () => {
  const { Backup, read } = load({
    [keys.notes]: [note("a", "2026-02-01T00:00:00Z", { title: "device" }), note("b", "2026-01-01T00:00:00Z")],
  });
  const backup = Backup.parse(
    backupText({
      notes: [
        note("a", "2026-01-15T00:00:00Z", { title: "older file copy" }),
        note("b", "2026-03-01T00:00:00Z", { title: "newer file copy" }),
        note("c", "2026-01-01T00:00:00Z"),
      ],
    }),
  );
  const result = Backup.apply(backup);
  const saved = Object.fromEntries(read(keys.notes).map((n) => [n.id, n.title]));
  assert.equal(result.notes, 3);
  assert.deepEqual(saved, { a: "device", b: "newer file copy", c: "Note c" });
});

test("replace swaps saved notes and searches for the file's", () => {
  const { Backup, read } = load({
    [keys.notes]: [note("a", "2026-01-01T00:00:00Z")],
    [keys.recent]: [{ term: "Tahoe", at: "2026-01-01T00:00:00Z" }],
  });
  const backup = Backup.parse(
    backupText({ notes: [note("z", "2026-01-01T00:00:00Z")], recentSearches: [{ term: "Mono", at: "2026-01-01T00:00:00Z" }] }),
  );
  Backup.apply(backup, { mode: "replace" });
  assert.deepEqual(read(keys.notes).map((n) => n.id), ["z"]);
  assert.deepEqual(read(keys.recent).map((r) => r.term), ["Mono"]);
});

test("recent searches merge without duplicates, newest first, capped", () => {
  const { Backup } = load();
  const existing = Array.from({ length: 15 }, (_, i) => ({ term: `old ${i}`, at: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z` }));
  const merged = Backup.mergeRecent(existing, [
    { term: "OLD 3", at: "2026-05-01T00:00:00Z" },
    { term: "new", at: "2026-04-01T00:00:00Z" },
  ]);
  assert.equal(merged.length, 15);
  assert.deepEqual([...merged.slice(0, 2).map((r) => r.term)], ["OLD 3", "new"]);
  assert.equal(merged.filter((r) => r.term.toLowerCase() === "old 3").length, 1);
});

test("importing settings without keys keeps this device's API keys", () => {
  const { Backup, Settings } = load({ [keys.settings]: { esriApiKey: "mine" } });
  Backup.apply(Backup.parse(backupText({ settings: { basemap: "esri-topo" } })));
  assert.equal(Settings.read().esriApiKey, "mine");
  assert.equal(Settings.read().basemap, "esri-topo");

  Backup.apply(Backup.parse(backupText({ settings: { esriApiKey: "theirs" } })));
  assert.equal(Settings.read().esriApiKey, "theirs");
});
