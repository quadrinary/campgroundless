// Tests reading and writing location files (GPX, KML/KMZ, GeoJSON, CSV).
// Run with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { DOMParser } = require("@xmldom/xmldom");

const webDir = path.join(__dirname, "..", "web");
const notesKey = "campgroundless.map-notes.v1";

function load(notes = []) {
  const storage = new Map([[notesKey, JSON.stringify(notes)]]);
  const window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };
  window.window = window;
  const context = vm.createContext({
    ...window,
    window,
    DOMParser,
    TextDecoder,
    Uint8Array,
    DataView,
    Blob,
    Response,
    DecompressionStream,
    crypto,
  });
  vm.runInContext(fs.readFileSync(path.join(webDir, "places.js"), "utf8"), context);
  const Places = context.window.CampgroundlessPlaces;
  const plain = (value) => JSON.parse(JSON.stringify(value));
  return {
    Places,
    read: async (name, text) => plain(await Places.read(name, typeof text === "string" ? Buffer.from(text) : text)),
    saved: () => JSON.parse(storage.get(notesKey)),
  };
}

// Builds a one-file zip (deflated), like a KMZ from Google Earth or onX.
function zip(name, text) {
  const data = Buffer.from(text);
  const packed = zlib.deflateRawSync(data);
  const fileName = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + fileName.length + packed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return new Uint8Array(Buffer.concat([local, fileName, packed, central, fileName, end]));
}

const gaiaGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="GaiaGPS">
  <wpt lat="38.5" lon="-120.2">
    <name>Creek camp</name>
    <desc>&lt;p&gt;Flat spot&lt;br/&gt;near water&lt;/p&gt;</desc>
    <sym>campsite-24.png</sym>
    <time>2026-05-01T12:00:00Z</time>
  </wpt>
  <wpt lat="38.6" lon="-120.3"><name>Spring</name><sym>Drinking Water</sym></wpt>
  <wpt lat="abc" lon="-120.3"><name>Broken</name></wpt>
  <trk><name>Drive in</name><trkseg><trkpt lat="38.5" lon="-120.2"/></trkseg></trk>
</gpx>`;

test("reads GPX waypoints from Gaia GPS-style files", async () => {
  const { read } = load();
  const result = await read("waypoints.gpx", gaiaGpx);
  assert.equal(result.format, "GPX");
  assert.equal(result.places.length, 2);
  assert.equal(result.invalid, 1);
  assert.equal(result.ignored, 1);
  assert.deepEqual(result.places[0], {
    lat: 38.5,
    lng: -120.2,
    title: "Creek camp",
    body: "Flat spot\nnear water",
    icon: "camp",
    time: "2026-05-01T12:00:00Z",
  });
  assert.equal(result.places[1].icon, "water");
});

const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder>
  <Placemark><name>Overlook</name><description><![CDATA[<b>Great</b> view &amp; sunset]]></description>
    <styleUrl>#icon-viewpoint</styleUrl><Point><coordinates>-111.5,37.2,1800</coordinates></Point></Placemark>
  <Placemark><name>Road</name><LineString><coordinates>-111.5,37.2 -111.6,37.3</coordinates></LineString></Placemark>
</Folder></Document></kml>`;

test("reads KML placemarks and skips lines", async () => {
  const { read } = load();
  const result = await read("places.kml", kml);
  assert.equal(result.format, "KML");
  assert.equal(result.ignored, 1);
  assert.equal(result.places.length, 1);
  assert.equal(result.places[0].lat, 37.2);
  assert.equal(result.places[0].lng, -111.5);
  assert.equal(result.places[0].body, "Great view & sunset");
  assert.equal(result.places[0].icon, "viewpoint");
});

test("reads KMZ archives", async () => {
  const { read } = load();
  const result = await read("onx-export.kmz", zip("doc.kml", kml));
  assert.equal(result.format, "KMZ");
  assert.equal(result.places[0].title, "Overlook");
});

test("reads GeoJSON points", async () => {
  const { read } = load();
  const geojson = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [-105.1, 39.6] }, properties: { title: "Trailhead", notes: "Lot", icon: "trailhead" } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: {} },
    ],
  };
  const result = await read("gaia.geojson", JSON.stringify(geojson));
  assert.equal(result.format, "GeoJSON");
  assert.equal(result.places.length, 1);
  assert.equal(result.ignored, 1);
  assert.equal(result.places[0].icon, "trail");
  assert.equal(result.places[0].body, "Lot");
});

test("reads CSV with common column names, quotes, and coordinate pairs", async () => {
  const { read } = load();
  const csv = 'Name,Lat,Long,Notes\r\n"Camp, upper",36.1,-118.2,"He said ""quiet"""\r\nBad,x,y,\r\n';
  const result = await read("list.csv", csv);
  assert.equal(result.format, "CSV");
  assert.equal(result.places.length, 1);
  assert.equal(result.invalid, 1);
  assert.equal(result.places[0].title, "Camp, upper");
  assert.equal(result.places[0].body, 'He said "quiet"');

  const pairs = await read("pairs.csv", "title;coordinates\nSpot;35.5, -112.1\n");
  assert.equal(pairs.places[0].lat, 35.5);
  assert.equal(pairs.places[0].lng, -112.1);
});

test("explains unusable files", async () => {
  const { read } = load();
  await assert.rejects(read("x.csv", "name,notes\nA,B\n"), /latitude/);
  await assert.rejects(read("x.json", JSON.stringify({ format: "campgroundless-backup" })), /Import backup/);
  await assert.rejects(read("x.gpx", '<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk/></gpx>'), /only has tracks/);
  await assert.rejects(read("x.xml", "<svg></svg>"), /not GPX or KML/);
  await assert.rejects(read("x.gpx", ""), /empty/);
});

test("plan skips duplicates and points outside coverage, and keeps text within note limits", async () => {
  const existing = [{ id: "a", lat: 38.5, lng: -120.2, title: "Creek camp", icon: "camp", body: "", createdAt: "x", updatedAt: "x" }];
  const { Places } = load(existing);
  const places = [
    { lat: 38.50005, lng: -120.2, title: "creek camp", body: "", icon: "camp", time: null },
    { lat: 10, lng: 10, title: "Far away", body: "", icon: "camp", time: null },
    { lat: 39, lng: -121, title: "x".repeat(100), body: "", icon: "camp", time: "2026-01-02T00:00:00Z" },
    { lat: 39.1, lng: -121, title: "", body: "", icon: "landmark", time: "not a date" },
  ];
  let n = 0;
  const now = new Date("2026-10-22T00:00:00Z");
  const result = JSON.parse(
    JSON.stringify(Places.plan(places, { inCoverage: (lat) => lat > 20, now, makeId: () => `id${(n += 1)}` })),
  );
  assert.deepEqual(result.skipped, { outside: 1, duplicate: 1 });
  assert.equal(result.shortened, 1);
  assert.equal(result.notes.length, 2);
  assert.equal(result.notes[0].title.length, 80);
  assert.equal(result.notes[0].createdAt, "2026-01-02T00:00:00.000Z");
  assert.equal(result.notes[1].title, "Imported location");
  assert.equal(result.notes[1].createdAt, now.toISOString());
});

test("add appends to saved locations", () => {
  const { Places, saved } = load([{ id: "a", title: "A" }]);
  assert.equal(Places.add([{ id: "b", title: "B" }]), 2);
  assert.deepEqual(saved().map((note) => note.id), ["a", "b"]);
});

const notes = [
  { id: "1", lat: 38.5, lng: -120.2, title: "Camp <A> & B", icon: "camp", body: "=SUM(1)", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "2", lat: 37.2, lng: -111.5, title: "Fire ring", icon: "fire", body: 'Line 1\n"Line 2"', createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
];

for (const format of ["gpx", "kml", "geojson", "csv"]) {
  test(`${format} export reads back with the same locations and icons`, async () => {
    const { Places, read } = load();
    const file = Places.write(format, notes, new Date("2026-10-22T12:00:00"));
    assert.match(file.name, new RegExp(`^campgroundless-locations-2026-10-22\\.${format}$`));
    const result = await read(file.name, file.text);
    assert.equal(result.places.length, 2);
    assert.deepEqual(
      result.places.map((p) => [p.lat, p.lng, p.title, p.icon]),
      [
        [38.5, -120.2, "Camp <A> & B", "camp"],
        [37.2, -111.5, "Fire ring", "fire"],
      ],
    );
    assert.equal(result.places[1].body, 'Line 1\n"Line 2"');
  });
}

test("exports include a plain-text copy of saved popup details", async () => {
  const { Places, read } = load();
  const starred = [{
    ...notes[0],
    body: "",
    details: '<div class="map-popup"><div class="map-popup-label">U.S. Forest Service recreation site</div><h3>Pine Flat</h3><p><strong>Season:</strong> May – Oct</p></div>',
  }];
  for (const format of ["gpx", "kml", "geojson", "csv"]) {
    const file = Places.write(format, starred);
    const result = await read(file.name, file.text);
    assert.match(result.places[0].body, /U\.S\. Forest Service recreation site/, format);
    assert.match(result.places[0].body, /Season: May – Oct/, format);
    assert.doesNotMatch(result.places[0].body, /<|class=/, format);
  }
});

test("CSV export guards cells that spreadsheets would run as formulas", () => {
  const { Places } = load();
  assert.match(Places.write("csv", notes).text, /,'=SUM\(1\),/);
});

test("icon matching recognizes common symbol names", () => {
  const { Places } = load();
  const cases = {
    "Campground": "camp",
    "drinking-water-24.png": "water",
    "Gas Station": "fuel",
    "Trail Head": "trail",
    "car-24.png": "road",
    "Scenic Area": "viewpoint",
    "Flag, Blue": "landmark",
    "": "landmark",
    "riverside": "landmark",
  };
  Object.entries(cases).forEach(([hint, icon]) => assert.equal(Places.iconFor(hint), icon, hint));
});
