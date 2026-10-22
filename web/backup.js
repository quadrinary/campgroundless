// Backup file export and import for settings, saved locations & notes, and recent searches.
// A backup is one JSON file (format "campgroundless-backup"); offline map areas are not included.
(() => {
  "use strict";

  const FORMAT = "campgroundless-backup";
  const VERSION = 1;
  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_NOTES = 5000;
  const MAX_RECENT = 15;
  const keys = {
    settings: "campgroundless.settings.v1",
    notes: "campgroundless.map-notes.v1",
    recent: "campgroundless.recent-searches.v1",
  };
  const secretFields = ["dataApiKey", "esriApiKey", "customBasemapApiKey"];
  const endpointFields = {
    dataUrl: "land data source",
    placeSearchUrl: "place search endpoint",
    basemapUrl: "custom basemap",
  };

  const placesHint = " To add waypoints from a GPX, KML, GeoJSON, or CSV file, use Import locations.";

  const Settings = () => window.CampgroundlessSettings;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function create({ settings = true, notes = true, recent = true, apiKeys = false } = {}, meta = {}) {
    const backup = {
      format: FORMAT,
      version: VERSION,
      exportedAt: (meta.now ?? new Date()).toISOString(),
      app: { build: meta.build ?? null, platform: meta.platform ?? "web" },
    };
    if (settings) {
      const current = Settings().read();
      if (!apiKeys) secretFields.forEach((field) => delete current[field]);
      backup.includesApiKeys = Boolean(apiKeys);
      backup.settings = current;
    }
    if (notes) {
      const saved = readJson(keys.notes, []);
      backup.notes = Array.isArray(saved) ? saved : [];
    }
    if (recent) {
      const saved = readJson(keys.recent, []);
      backup.recentSearches = Array.isArray(saved) ? saved : [];
    }
    return backup;
  }

  function fileName(now = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `campgroundless-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
  }

  function validNote(note) {
    return (
      note &&
      typeof note === "object" &&
      typeof note.id === "string" && note.id.length <= 100 &&
      typeof note.title === "string" && note.title.length <= 200 &&
      typeof note.body === "string" && note.body.length <= 5000 &&
      typeof note.icon === "string" &&
      typeof note.createdAt === "string" &&
      typeof note.updatedAt === "string" &&
      Number.isFinite(note.lat) && Math.abs(note.lat) <= 90 &&
      Number.isFinite(note.lng) && Math.abs(note.lng) <= 180
    );
  }

  function validRecent(entry) {
    return entry && typeof entry.term === "string" && entry.term.length <= 300 && typeof entry.at === "string";
  }

  function cleanNote(note) {
    const { id, lat, lng, title, icon, body, createdAt, updatedAt } = note;
    return { id, lat, lng, title, icon, body, createdAt, updatedAt };
  }

  // Keeps only known settings and rejects endpoints that are not HTTPS.
  function cleanSettings(settings) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      throw new Error("The settings in this file are not readable.");
    }
    const known = Object.keys(Settings().defaults);
    const clean = Object.fromEntries(Object.entries(settings).filter(([key]) => known.includes(key)));
    if (clean.placeSearchUrl) Settings().validateHttpUrl(clean.placeSearchUrl, "The file's place search endpoint");
    if (clean.dataUrl) Settings().validateHttpUrl(clean.dataUrl, "The file's land data URL");
    if (clean.basemapUrl) {
      Settings().validateHttpUrl(
        clean.basemapUrl.replace(/\{(z|x|y|apiKey)\}/g, "1"),
        "The file's custom basemap URL",
      );
    }
    return clean;
  }

  // Parses and checks a backup file. Throws an Error with a readable message.
  function parse(text) {
    if (typeof text !== "string" || !text.trim()) throw new Error("The file is empty.");
    if (text.length > MAX_BYTES) throw new Error("The file is too large to be a Campgroundless backup.");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`The file is not a Campgroundless backup.${placesHint}`);
    }
    if (!data || data.format !== FORMAT) throw new Error(`This is not a Campgroundless backup file.${placesHint}`);
    if (!Number.isInteger(data.version) || data.version > VERSION) {
      throw new Error("This backup was made by a newer version of Campgroundless. Update the app and try again.");
    }
    const backup = { exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : null };
    if ("settings" in data) {
      backup.settings = cleanSettings(data.settings);
      backup.includesApiKeys = secretFields.some((field) => typeof backup.settings[field] === "string" && backup.settings[field]);
    }
    if ("notes" in data) {
      if (!Array.isArray(data.notes)) throw new Error("The saved locations in this file are not readable.");
      if (data.notes.length > MAX_NOTES) throw new Error("The file has too many saved locations.");
      backup.notes = data.notes.filter(validNote).map(cleanNote);
      backup.skippedNotes = data.notes.length - backup.notes.length;
    }
    if ("recentSearches" in data) {
      if (!Array.isArray(data.recentSearches)) throw new Error("The recent searches in this file are not readable.");
      backup.recentSearches = data.recentSearches
        .filter(validRecent)
        .map(({ term, at }) => ({ term, at }))
        .slice(0, MAX_RECENT);
    }
    if (!backup.settings && !backup.notes && !backup.recentSearches) {
      throw new Error("The file does not contain any settings, saved locations, or searches.");
    }
    return backup;
  }

  // Describes custom endpoints in a backup that differ from this device, so the user can review them.
  function changedEndpoints(backup, current = Settings().read()) {
    if (!backup.settings) return [];
    return Object.entries(endpointFields)
      .filter(([field]) => field in backup.settings && backup.settings[field] !== current[field])
      .filter(([field]) => backup.settings[field] && backup.settings[field] !== Settings().defaults[field])
      .map(([field, label]) => ({ field, label, value: backup.settings[field] }));
  }

  // Same id: the more recently edited copy wins. Everything else is kept.
  function mergeNotes(existing, incoming) {
    const byId = new Map(existing.map((note) => [note.id, note]));
    incoming.forEach((note) => {
      const current = byId.get(note.id);
      if (!current || Date.parse(note.updatedAt) > Date.parse(current.updatedAt)) byId.set(note.id, note);
    });
    return [...byId.values()];
  }

  function mergeRecent(existing, incoming) {
    const seen = new Set();
    return [...incoming, ...existing]
      .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
      .filter((entry) => {
        const term = entry.term.toLowerCase();
        if (seen.has(term)) return false;
        seen.add(term);
        return true;
      })
      .slice(0, MAX_RECENT);
  }

  // Writes the chosen parts of a parsed backup. mode is "merge" or "replace".
  function apply(backup, { settings = true, notes = true, recent = true, mode = "merge" } = {}) {
    const result = { settings: false, notes: null, recent: null };
    if (settings && backup.settings) {
      const current = Settings().read();
      const next = { ...Settings().defaults, ...backup.settings };
      // A backup made without API keys keeps the keys already on this device.
      secretFields.forEach((field) => {
        if (!(field in backup.settings)) next[field] = current[field];
      });
      Settings().write(next);
      result.settings = true;
    }
    if (notes && backup.notes) {
      const existing = readJson(keys.notes, []);
      const next = mode === "replace" ? backup.notes : mergeNotes(Array.isArray(existing) ? existing : [], backup.notes);
      window.localStorage.setItem(keys.notes, JSON.stringify(next));
      result.notes = next.length;
    }
    if (recent && backup.recentSearches) {
      const existing = readJson(keys.recent, []);
      const next = mode === "replace"
        ? backup.recentSearches
        : mergeRecent(Array.isArray(existing) ? existing.filter(validRecent) : [], backup.recentSearches);
      window.localStorage.setItem(keys.recent, JSON.stringify(next));
      result.recent = next.length;
    }
    return result;
  }

  window.CampgroundlessBackup = Object.freeze({
    FORMAT,
    VERSION,
    create,
    fileName,
    parse,
    changedEndpoints,
    mergeNotes,
    mergeRecent,
    apply,
  });
})();
