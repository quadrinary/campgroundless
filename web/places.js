// Location files: reads waypoints from GPX, KML/KMZ, GeoJSON, and CSV files (for example exports
// from Gaia GPS, onX, CalTopo, Google My Maps, or a spreadsheet) and writes saved locations back
// out in those formats. Only points are read; tracks, routes, lines, and areas are counted and skipped.
(() => {
  "use strict";

  const MAX_BYTES = 10 * 1024 * 1024;
  const MAX_UNZIPPED = 20 * 1024 * 1024;
  const MAX_PLACES = 5000;
  const MAX_TITLE = 80;
  const MAX_BODY = 1200;
  const DUPLICATE_METERS = 25;
  const notesKey = "campgroundless.map-notes.v1";
  const DEFAULT_ICON = "landmark";

  // Matches symbol/icon names used by Gaia GPS, Garmin, CalTopo, and others to this map's note icons.
  // Order matters: "drinking water" is water and "campfire" is fire, not camp.
  const iconRules = [
    ["water", /water|drink|spring|faucet|potable|tap\b/],
    ["fire", /fire/],
    ["camp", /camp|tent|\brv\b|bivy|shelter|lodging|cabin/],
    ["wildlife", /wildlife|animal|bear|deer|elk|paw|hunt|bird|fish|track/],
    ["trail", /trail|hik|walk|foot/],
    ["fuel", /fuel|gas\b|gas[\s_-]?station|petrol/],
    ["food", /food|restaurant|cafe|dining|grocery|store|shop/],
    ["photo", /photo|camera/],
    ["viewpoint", /view|vista|scenic|overlook|binocular|summit|peak|mountain/],
    ["road", /road|\bcar\b|car[\s_-]|truck|4x4|jeep|parking|gate|vehicle|atv|utv|offroad|off-road|bridge/],
  ];
  const iconSymbols = {
    camp: "Campground",
    water: "Drinking Water",
    fire: "Campfire",
    wildlife: "Animal Tracks",
    trail: "Trail Head",
    road: "Car",
    fuel: "Gas Station",
    food: "Restaurant",
    viewpoint: "Scenic Area",
    landmark: "Flag, Blue",
    photo: "Photo",
  };
  const formats = {
    gpx: { label: "GPX", extension: "gpx", mimeType: "application/gpx+xml" },
    kml: { label: "KML", extension: "kml", mimeType: "application/vnd.google-earth.kml+xml" },
    geojson: { label: "GeoJSON", extension: "geojson", mimeType: "application/geo+json" },
    csv: { label: "CSV", extension: "csv", mimeType: "text/csv" },
  };

  function iconFor(...hints) {
    const values = hints.filter((hint) => typeof hint === "string" && hint.trim()).map((hint) => hint.trim().toLowerCase());
    const exact = values.find((value) => Object.hasOwn(iconSymbols, value));
    if (exact) return exact;
    const text = values.join(" ");
    if (!text) return DEFAULT_ICON;
    return iconRules.find(([, pattern]) => pattern.test(text))?.[0] ?? DEFAULT_ICON;
  }

  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

  const htmlTag = /<\/?(br|p|div|span|b|i|u|em|strong|a|img|ul|ol|li|table|tbody|tr|td|th|h[1-6]|font|hr)\b[^>]*>/i;

  // Descriptions from Gaia and KML are often HTML. Notes are plain text, so keep only the words.
  // Text without HTML tags is kept as written (so "<3" or "a < b" survive).
  function plainText(value) {
    if (typeof value !== "string") return "";
    if (!htmlTag.test(value)) return value.trim();
    return value
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
        if (code[0] === "#") {
          const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
          return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
        }
        return entities[code.toLowerCase()] ?? match;
      })
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function validPoint(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  }

  function place(lat, lng, { title = "", body = "", icon = DEFAULT_ICON, time = null } = {}) {
    return { lat, lng, title: title.replace(/\s+/g, " ").trim(), body: body.trim(), icon, time };
  }

  // ---- XML (GPX, KML) ----

  function parseXml(text, label) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(text, "application/xml");
    } catch {
      doc = null;
    }
    if (!doc?.documentElement || doc.getElementsByTagName("parsererror").length) {
      throw new Error(`The ${label} file could not be read. It may be damaged or incomplete.`);
    }
    return doc;
  }

  const localName = (element) => element.localName || String(element.nodeName).split(":").pop();

  function descendants(root, name) {
    return Array.from(root.getElementsByTagName("*")).filter((element) => localName(element) === name);
  }

  function childElements(element) {
    return Array.from(element.childNodes).filter((node) => node.nodeType === 1);
  }

  function childText(element, name) {
    const child = childElements(element).find((node) => localName(node) === name);
    return child ? String(child.textContent ?? "").trim() : "";
  }

  function joinText(...parts) {
    return [...new Set(parts.map((part) => plainText(part)).filter(Boolean))].join("\n\n");
  }

  function parseGpx(doc) {
    const places = [];
    let invalid = 0;
    descendants(doc, "wpt").forEach((wpt) => {
      const lat = Number.parseFloat(wpt.getAttribute("lat"));
      const lng = Number.parseFloat(wpt.getAttribute("lon"));
      if (!validPoint(lat, lng)) {
        invalid += 1;
        return;
      }
      places.push(
        place(lat, lng, {
          title: childText(wpt, "name"),
          body: joinText(childText(wpt, "desc"), childText(wpt, "cmt")),
          icon: iconFor(childText(wpt, "sym"), childText(wpt, "type")),
          time: childText(wpt, "time") || null,
        }),
      );
    });
    const ignored = descendants(doc, "trk").length + descendants(doc, "rte").length;
    return { places, invalid, ignored };
  }

  function kmlData(placemark) {
    const data = {};
    descendants(placemark, "Data").forEach((element) => {
      const name = element.getAttribute("name");
      if (name) data[name.toLowerCase()] = childText(element, "value");
    });
    descendants(placemark, "SimpleData").forEach((element) => {
      const name = element.getAttribute("name");
      if (name) data[name.toLowerCase()] = String(element.textContent ?? "").trim();
    });
    return data;
  }

  function parseKml(doc) {
    const places = [];
    let invalid = 0;
    let ignored = 0;
    descendants(doc, "Placemark").forEach((placemark) => {
      const point = descendants(placemark, "Point")[0];
      if (!point) {
        ignored += 1;
        return;
      }
      const [lng, lat] = childText(point, "coordinates").split(",").map((value) => Number.parseFloat(value));
      if (!validPoint(lat, lng)) {
        invalid += 1;
        return;
      }
      const data = kmlData(placemark);
      places.push(
        place(lat, lng, {
          title: childText(placemark, "name"),
          body: joinText(childText(placemark, "description"), data.notes, data.description),
          icon: iconFor(data.icon, data.sym, data.symbol, data.type, childText(placemark, "styleUrl").replace(/^#/, "")),
          time: childText(descendants(placemark, "TimeStamp")[0] ?? placemark, "when") || data.created || null,
        }),
      );
    });
    return { places, invalid, ignored };
  }

  // ---- GeoJSON ----

  function firstString(object, keys) {
    for (const key of keys) {
      const value = object?.[key];
      if (typeof value === "string" && value.trim()) return value;
      if (typeof value === "number") return String(value);
    }
    return "";
  }

  function parseGeoJson(data) {
    const features =
      data.type === "FeatureCollection" && Array.isArray(data.features)
        ? data.features
        : data.type === "Feature"
          ? [data]
          : data.type && data.coordinates
            ? [{ type: "Feature", geometry: data, properties: {} }]
            : null;
    if (!features) throw new Error("This JSON file is not GeoJSON. Choose a GeoJSON file with point features.");
    const places = [];
    let invalid = 0;
    let ignored = 0;
    features.forEach((feature) => {
      const geometry = feature?.geometry;
      const points =
        geometry?.type === "Point" ? [geometry.coordinates] : geometry?.type === "MultiPoint" ? geometry.coordinates : null;
      if (!points) {
        ignored += 1;
        return;
      }
      const properties = feature.properties && typeof feature.properties === "object" ? feature.properties : {};
      points.forEach((coordinates) => {
        const [lng, lat] = Array.isArray(coordinates) ? coordinates.map(Number) : [];
        if (!validPoint(lat, lng)) {
          invalid += 1;
          return;
        }
        places.push(
          place(lat, lng, {
            title: firstString(properties, ["title", "name", "Name", "label"]),
            body: joinText(
              firstString(properties, ["description", "desc", "Description"]),
              firstString(properties, ["notes", "note", "comment", "body"]),
            ),
            icon: iconFor(firstString(properties, ["icon", "marker-symbol", "sym", "symbol", "type", "category"])),
            time: firstString(properties, ["createdAt", "time_created", "time", "created", "updated_date"]) || null,
          }),
        );
      });
    });
    return { places, invalid, ignored };
  }

  // ---- CSV ----

  function csvRows(text) {
    const firstLine = text.slice(0, text.search(/\r?\n|$/));
    const delimiter = [",", "\t", ";"].reduce((best, candidate) =>
      firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
    );
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"' && field === "") {
        quoted = true;
      } else if (char === delimiter) {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((cells) => cells.some((cell) => cell.trim()));
  }

  const csvColumns = {
    lat: ["latitude", "lat", "y"],
    lng: ["longitude", "lon", "lng", "long", "x"],
    both: ["coordinates", "coords", "latlng", "latlon", "location", "position", "gps"],
    title: ["name", "title", "label", "waypoint"],
    body: ["description", "desc", "notes", "note", "comment", "comments", "body", "details"],
    icon: ["icon", "symbol", "sym", "type", "category", "marker"],
    time: ["createdat", "created", "date", "time", "timestamp"],
  };

  function parseCsv(text) {
    const rows = csvRows(text);
    if (rows.length < 2) throw new Error("The CSV file needs a header row and at least one location.");
    const header = rows[0].map((cell) => cell.toLowerCase().replace(/[^a-z]/g, ""));
    const column = Object.fromEntries(
      Object.entries(csvColumns).map(([field, names]) => [field, names.map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1]),
    );
    const hasSeparate = column.lat >= 0 && column.lng >= 0;
    if (!hasSeparate && column.both < 0) {
      throw new Error('The CSV file needs "latitude" and "longitude" columns (or a "coordinates" column with "lat, lng").');
    }
    const places = [];
    let invalid = 0;
    rows.slice(1).forEach((cells) => {
      const cell = (index) => (index >= 0 ? (cells[index] ?? "").trim() : "");
      let lat;
      let lng;
      if (hasSeparate) {
        lat = Number.parseFloat(cell(column.lat));
        lng = Number.parseFloat(cell(column.lng));
      } else {
        [lat, lng] = cell(column.both).split(/[,;\s]+/).filter(Boolean).map((value) => Number.parseFloat(value));
      }
      if (!validPoint(lat, lng)) {
        invalid += 1;
        return;
      }
      places.push(
        place(lat, lng, {
          title: cell(column.title),
          body: cell(column.body).replace(/\r\n?/g, "\n"),
          icon: iconFor(cell(column.icon)),
          time: cell(column.time) || null,
        }),
      );
    });
    return { places, invalid, ignored: 0 };
  }

  // ---- KMZ (zip) ----

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Reads the main .kml file from a KMZ (zip) archive using the zip central directory.
  async function kmlFromKmz(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error("The KMZ file could not be opened. It may be damaged.");
    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const entries = [];
    for (let i = 0; i < count && offset + 46 <= bytes.length; i += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const nameLength = view.getUint16(offset + 28, true);
      entries.push({
        method: view.getUint16(offset + 10, true),
        compressedSize: view.getUint32(offset + 20, true),
        size: view.getUint32(offset + 24, true),
        localOffset: view.getUint32(offset + 42, true),
        name: new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
      });
      offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    }
    const kmls = entries.filter((entry) => /\.kml$/i.test(entry.name));
    const entry = kmls.find((item) => /(^|\/)doc\.kml$/i.test(item.name)) ?? kmls[0];
    if (!entry) throw new Error("The KMZ file does not contain a KML file.");
    if (entry.size > MAX_UNZIPPED) throw new Error("The KML file inside this KMZ is too large.");
    const local = entry.localOffset;
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) {
      throw new Error("The KMZ file could not be opened. It may be damaged.");
    }
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + entry.compressedSize);
    let output;
    if (entry.method === 0) output = data;
    else if (entry.method === 8) output = await inflateRaw(data);
    else throw new Error("The KMZ file uses an unsupported compression method.");
    if (output.length > MAX_UNZIPPED) throw new Error("The KML file inside this KMZ is too large.");
    return new TextDecoder().decode(output);
  }

  // ---- Reading a file ----

  // Reads a location file. Returns { format, places, invalid, ignored }; throws an Error with a readable message.
  async function read(name, bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if (!bytes.length) throw new Error("The file is empty.");
    if (bytes.length > MAX_BYTES) throw new Error("The file is too large to import (10 MB limit).");
    let format;
    let result;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      format = "KMZ";
      result = parseKml(parseXml(await kmlFromKmz(bytes), "KML"));
    } else {
      const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
      const start = text.trimStart();
      if (start.startsWith("<")) {
        const doc = parseXml(text, "location");
        const root = localName(doc.documentElement).toLowerCase();
        if (root === "gpx") {
          format = "GPX";
          result = parseGpx(doc);
        } else if (root === "kml") {
          format = "KML";
          result = parseKml(doc);
        } else {
          throw new Error("This XML file is not GPX or KML.");
        }
      } else if (start.startsWith("{") || start.startsWith("[")) {
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("The file is not valid JSON.");
        }
        if (data?.format === "campgroundless-backup") {
          throw new Error("This is a Campgroundless backup. Use Import backup in the Backup section instead.");
        }
        format = "GeoJSON";
        result = parseGeoJson(data ?? {});
      } else if (/\.(gpx|kml|kmz|json|geojson)$/i.test(name ?? "")) {
        throw new Error("The file could not be read. It may be damaged or in a different format.");
      } else {
        format = "CSV";
        result = parseCsv(text);
      }
    }
    if (result.places.length > MAX_PLACES) {
      throw new Error(`The file has more than ${MAX_PLACES.toLocaleString()} locations. Split it into smaller files.`);
    }
    if (!result.places.length) {
      const extra = result.ignored ? " It only has tracks, routes, lines, or areas, which are not imported." : "";
      throw new Error(`No point locations were found in this ${format} file.${extra}`);
    }
    return { format, ...result };
  }

  // ---- Turning places into saved notes ----

  function metersBetween(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
  }

  function isDuplicate(candidate, notes) {
    const title = candidate.title.trim().toLowerCase();
    return notes.some(
      (note) => note.title.trim().toLowerCase() === title && metersBetween(candidate, note) <= DUPLICATE_METERS,
    );
  }

  function validTime(value, fallback) {
    const time = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
  }

  function readNotes() {
    try {
      const notes = JSON.parse(window.localStorage.getItem(notesKey) ?? "[]");
      return Array.isArray(notes) ? notes.filter((note) => note && typeof note.title === "string") : [];
    } catch {
      return [];
    }
  }

  // Splits read places into notes to add and counts what is skipped.
  // inCoverage(lat, lng) decides whether a point is inside the map's coverage area.
  function plan(places, { existing = readNotes(), inCoverage = () => true, now = new Date(), makeId } = {}) {
    const stamp = now.toISOString();
    const id = makeId ?? (() => `import-${crypto.randomUUID()}`);
    const notes = [];
    const skipped = { outside: 0, duplicate: 0 };
    let shortened = 0;
    places.forEach((item) => {
      const lat = Math.round(item.lat * 1e6) / 1e6;
      const lng = Math.round(item.lng * 1e6) / 1e6;
      if (!inCoverage(lat, lng)) {
        skipped.outside += 1;
        return;
      }
      const title = item.title.slice(0, MAX_TITLE);
      const body = item.body.slice(0, MAX_BODY);
      const candidate = { lat, lng, title };
      if (isDuplicate(candidate, existing) || isDuplicate(candidate, notes)) {
        skipped.duplicate += 1;
        return;
      }
      if (title.length < item.title.length || body.length < item.body.length) shortened += 1;
      notes.push({
        id: id(),
        lat,
        lng,
        title: title || (body ? "" : "Imported location"),
        icon: item.icon,
        body,
        createdAt: validTime(item.time, stamp),
        updatedAt: stamp,
      });
    });
    return { notes, skipped, shortened };
  }

  function add(notes) {
    const next = [...readNotes(), ...notes];
    window.localStorage.setItem(notesKey, JSON.stringify(next));
    return next.length;
  }

  // ---- Writing files ----

  function xml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  }

  function toGpx(notes, now = new Date()) {
    const points = notes.map(
      (note) => `  <wpt lat="${note.lat}" lon="${note.lng}">
    <time>${xml(note.createdAt)}</time>
    <name>${xml(note.title)}</name>
    <desc>${xml(note.body)}</desc>
    <sym>${xml(iconSymbols[note.icon] ?? iconSymbols[DEFAULT_ICON])}</sym>
    <type>${xml(note.icon)}</type>
  </wpt>`,
    );
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Campgroundless" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Campgroundless saved locations</name>
    <time>${now.toISOString()}</time>
  </metadata>
${points.join("\n")}
</gpx>
`;
  }

  function toKml(notes) {
    const placemarks = notes.map(
      (note) => `    <Placemark>
      <name>${xml(note.title)}</name>
      <description>${xml(note.body)}</description>
      <TimeStamp><when>${xml(note.createdAt)}</when></TimeStamp>
      <ExtendedData><Data name="icon"><value>${xml(note.icon)}</value></Data></ExtendedData>
      <Point><coordinates>${note.lng},${note.lat}</coordinates></Point>
    </Placemark>`,
    );
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Campgroundless saved locations</name>
${placemarks.join("\n")}
  </Document>
</kml>
`;
  }

  function toGeoJson(notes) {
    return `${JSON.stringify(
      {
        type: "FeatureCollection",
        features: notes.map((note) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [note.lng, note.lat] },
          properties: {
            name: note.title,
            description: note.body,
            icon: note.icon,
            "marker-symbol": iconSymbols[note.icon] ?? iconSymbols[DEFAULT_ICON],
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          },
        })),
      },
      null,
      2,
    )}\n`;
  }

  function csvCell(value) {
    let text = String(value ?? "");
    // Spreadsheet apps run cells that start with these characters as formulas.
    if (/^[=+@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toCsv(notes) {
    const rows = [["name", "latitude", "longitude", "description", "icon", "created", "updated"]];
    notes.forEach((note) => rows.push([note.title, note.lat, note.lng, note.body, note.icon, note.createdAt, note.updatedAt]));
    return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  }

  const writers = { gpx: toGpx, kml: toKml, geojson: toGeoJson, csv: toCsv };

  // Builds a location file. Returns { name, text, mimeType }.
  function write(format, notes = readNotes(), now = new Date()) {
    const info = formats[format];
    if (!info) throw new Error("Unknown location file format.");
    const pad = (n) => String(n).padStart(2, "0");
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return {
      name: `campgroundless-locations-${date}.${info.extension}`,
      text: writers[format](notes, now),
      mimeType: info.mimeType,
    };
  }

  window.CampgroundlessPlaces = Object.freeze({
    formats,
    read,
    plan,
    add,
    write,
    readNotes,
    iconFor,
    plainText,
    parseCsv,
  });
})();
