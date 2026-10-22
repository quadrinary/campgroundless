(() => {
  "use strict";

  const Settings = window.CampgroundlessSettings;
  const advancedFields = [
    "dataUrl",
    "dataApiKey",
    "dataAttribution",
    "placeSearchUrl",
    "basemapUrl",
    "basemapAttribution",
    "esriApiKey",
    "customBasemapApiKey",
  ];
  const fontFields = { fontBody: "body", fontSearch: "search", fontCaption: "caption", fontMap: "map" };

  // Checks the Advanced values, which reload the map when saved. Throws a readable error.
  function validateAdvanced(values) {
    Settings.validateHttpUrl(values.placeSearchUrl, "Place search endpoint");
    if (values.dataSource === "custom") {
      if (!values.dataUrl) throw new Error("Enter a Feature Layer URL to use a custom data source.");
      Settings.validateHttpUrl(values.dataUrl, "Feature Layer URL");
      if (!/\/FeatureServer\/\d+\/?$/i.test(new URL(values.dataUrl).pathname)) {
        throw new Error("Feature Layer URL must end with /FeatureServer/{layer-number}.");
      }
    }
    if (values.basemapUrl) {
      const template = values.basemapUrl;
      if (!template.includes("{z}") || !template.includes("{x}") || !template.includes("{y}")) {
        throw new Error("Custom tile URL must include {z}, {x}, and {y}.");
      }
      Settings.validateHttpUrl(
        template.replaceAll("{z}", "1").replaceAll("{x}", "1").replaceAll("{y}", "1").replaceAll("{apiKey}", "key"),
        "Custom tile URL",
      );
    }
  }

  // Applies one Map or Display control to the live map. Returns false if it could not be saved.
  function applyControl(name, value, mapApi) {
    if (name === "basemap") {
      mapApi.setBasemap(value);
      return true;
    }
    if (name === "settingsLayer") {
      mapApi.setManagerLayer(value.name, value.checked);
      return true;
    }
    if (name === "recreationSitesMinZoom") return mapApi.update({ recreationSitesMinZoom: Number(value) });
    if (name === "showLandDisclaimer" || name === "showBoundaryData" || name === "popupClickBehavior" || name === "theme") {
      return mapApi.update({ [name]: value });
    }
    if (name === "typography") return mapApi.update({ typography: { ...value } });
    return true;
  }

  window.CampgroundlessSettingsPanel = Object.freeze({ validateAdvanced, applyControl });

  const form = document.getElementById("settings-form");
  if (!form) return;
  const message = document.getElementById("settings-message");
  const mapApi = () => window.CampgroundlessMap;

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
  }

  function current() {
    return mapApi()?.getSettings() ?? Settings.read();
  }

  function typographyFromForm() {
    return Object.fromEntries(
      Object.entries(fontFields).map(([field, key]) => [key, Number(form.elements[field].value)]),
    );
  }

  function updateFontOutputs() {
    Object.keys(fontFields).forEach((field) => {
      const id = `settings-${field.replace("font", "font-").toLowerCase()}-value`;
      document.getElementById(id).textContent = field === "fontMap"
        ? `${form.elements[field].value}%`
        : `${form.elements[field].value} px`;
    });
  }

  function loadMapControls(settings) {
    const customOption = form.elements.basemap.querySelector('option[value="custom"]');
    customOption.hidden = !settings.basemapUrl;
    customOption.disabled = !settings.basemapUrl;
    const option = mapApi()?.activeBasemapOption() ??
      (settings.basemap === "osm" ? `osm:${settings.osmLayer}` : settings.basemap);
    form.elements.basemap.value = option;
    if (form.elements.basemap.value !== option) form.elements.basemap.value = "vector";
    form.querySelectorAll('input[name="settingsLayer"]').forEach((input) => {
      input.checked = Boolean(settings.layers[input.value]);
    });
    form.elements.recreationSitesMinZoom.value = String(settings.recreationSitesMinZoom);
    form.elements.popupClickBehavior.value = settings.popupClickBehavior;
  }

  function loadForm(settings) {
    loadMapControls(settings);
    form.elements.theme.value = settings.theme;
    form.elements.fontBody.value = settings.typography.body;
    form.elements.fontSearch.value = settings.typography.search;
    form.elements.fontCaption.value = settings.typography.caption;
    form.elements.fontMap.value = settings.typography.map;
    updateFontOutputs();
    form.elements.showLandDisclaimer.checked = settings.showLandDisclaimer !== false;
    form.elements.showBoundaryData.checked = settings.showBoundaryData !== false;
    form.querySelector(`input[name="dataSource"][value="${settings.dataSource}"]`).checked = true;
    advancedFields.forEach((field) => {
      form.elements[field].value = settings[field] ?? "";
    });
    updateConditionalFields();
  }

  function updateConditionalFields() {
    document.getElementById("custom-data-fields").hidden =
      form.querySelector('input[name="dataSource"]:checked')?.value !== "custom";
  }

  function advancedValues() {
    const values = Object.fromEntries(advancedFields.map((field) => [field, form.elements[field].value.trim()]));
    values.dataSource = form.querySelector('input[name="dataSource"]:checked').value;
    return values;
  }

  function commitAdvanced() {
    const values = advancedValues();
    try {
      validateAdvanced(values);
    } catch (error) {
      setMessage(error.message, true);
      return;
    }
    const settings = { ...current(), ...values };
    if (!settings.basemapUrl && settings.basemap === "custom") settings.basemap = "vector";
    try {
      Settings.write(settings);
    } catch (error) {
      setMessage(`Could not save settings: ${error.message}`, true);
      return;
    }
    setMessage("Saved. Reloading the map…");
    sessionStorage.setItem("campgroundless.open-settings", "1");
    location.reload();
  }

  function report(saved) {
    setMessage(saved === false ? "Applied for this visit, but could not be saved on this device." : "");
  }

  form.addEventListener("submit", (event) => event.preventDefault());

  form.addEventListener("input", (event) => {
    const field = event.target.name;
    if (field in fontFields) {
      updateFontOutputs();
      report(applyControl("typography", typographyFromForm(), mapApi()));
    }
  });

  form.addEventListener("change", (event) => {
    const target = event.target;
    const field = target.name;
    if (target.closest("[data-backup]")) return;
    if (!mapApi() && !advancedFields.includes(field) && field !== "dataSource") return;
    if (field === "dataSource") {
      updateConditionalFields();
      if (target.value === "custom" && !form.elements.dataUrl.value.trim()) {
        setMessage("Enter a Feature Layer URL to switch to a custom data source.");
        form.elements.dataUrl.focus();
        return;
      }
      commitAdvanced();
    } else if (advancedFields.includes(field)) {
      commitAdvanced();
    } else if (field === "settingsLayer") {
      report(applyControl(field, { name: target.value, checked: target.checked }, mapApi()));
    } else if (field === "showLandDisclaimer" || field === "showBoundaryData") {
      report(applyControl(field, target.checked, mapApi()));
    } else if (field in fontFields) {
      report(applyControl("typography", typographyFromForm(), mapApi()));
    } else if (field) {
      report(applyControl(field, target.value, mapApi()));
    }
  });

  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && advancedFields.includes(event.target.name)) {
      event.preventDefault();
      event.target.blur();
    }
  });

  document.querySelectorAll("[data-reveal]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.reveal);
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.textContent = reveal ? "Hide" : "Show";
      button.setAttribute("aria-label", button.getAttribute("aria-label").replace(/^(Show|Hide)/, reveal ? "Hide" : "Show"));
    });
  });

  document.getElementById("reset-settings").addEventListener("click", () => {
    if (!window.confirm("Reset all settings to defaults? Saved API keys will be removed and the map will reload.")) return;
    try {
      Settings.write(structuredClone(Settings.defaults));
    } catch (error) {
      setMessage(`Could not reset settings: ${error.message}`, true);
      return;
    }
    sessionStorage.setItem("campgroundless.open-settings", "1");
    location.reload();
  });

  window.addEventListener("campgroundless:settingschange", () => loadMapControls(current()));

  const storageCategories = [
    { key: "campgroundless.settings.v1", label: "Map settings", note: "Your preferences, including any saved API keys" },
    { key: "campgroundless.map-notes.v1", label: "Saved places & notes", note: "Notes and saved search results", count: (v) => (Array.isArray(v) ? v.length : 0) },
    { key: "campgroundless.recent-searches.v1", label: "Recent searches", note: "Place searches shown under the search bar", count: (v) => (Array.isArray(v) ? v.length : 0) },
  ];

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function localStorageBytes(key) {
    const value = localStorage.getItem(key);
    return value === null ? 0 : new Blob([key, value]).size;
  }

  async function appCacheStats() {
    if (!("caches" in window)) return { bytes: 0, files: 0, supported: false };
    let bytes = 0;
    let files = 0;
    for (const name of await caches.keys()) {
      if (!name.startsWith("campgroundless-shell-")) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (response) {
          bytes += (await response.clone().blob()).size;
          files += 1;
        }
      }
    }
    return { bytes, files, supported: true };
  }

  async function refreshStorage() {
    const list = document.getElementById("storage-list");
    const total = document.getElementById("storage-total");
    const rows = storageCategories.map((category) => {
      let items = null;
      if (category.count) {
        try {
          items = category.count(JSON.parse(localStorage.getItem(category.key) || "[]"));
        } catch {
          items = null;
        }
      }
      return { label: category.label, note: category.note, bytes: localStorageBytes(category.key), items };
    });
    const isNativeApp = Boolean(window.CampgroundlessNative?.isNative);
    document.getElementById("storage-clear-files").hidden = isNativeApp;
    if (!isNativeApp) {
      const cache = await appCacheStats();
      rows.push({
        label: "App file cache",
        note: cache.supported ? "Page, script and icon copies for faster, offline-capable launches" : "Not supported in this browser",
        bytes: cache.bytes,
        items: cache.supported ? cache.files : null,
      });
    }
    const offline = window.CampgroundlessOffline;
    if (offline?.supported) {
      const packs = await offline.listPacks().catch(() => []);
      rows.push({
        label: "Offline map areas",
        note: "Manage them in Offline maps",
        bytes: packs.reduce((sum, pack) => sum + (Number(pack.bytes) || Number(pack.dataBytes) || 0), 0),
        items: packs.length,
      });
    }
    list.replaceChildren(
      ...rows.map((row) => {
        const item = document.createElement("li");
        const text = document.createElement("span");
        const strong = document.createElement("strong");
        strong.textContent = row.label;
        const small = document.createElement("small");
        small.textContent = row.items === null ? row.note : `${row.note} · ${row.items} item${row.items === 1 ? "" : "s"}`;
        text.append(strong, small);
        const size = document.createElement("span");
        size.className = "storage-size";
        size.textContent = formatBytes(row.bytes);
        item.append(text, size);
        return item;
      }),
    );
    const sum = rows.reduce((acc, row) => acc + row.bytes, 0);
    let summary = `Total: ${formatBytes(sum)}.`;
    if (navigator.storage?.estimate && !isNativeApp) {
      try {
        const { usage, quota } = await navigator.storage.estimate();
        if (usage !== undefined) {
          summary += ` The browser reports ${formatBytes(usage)} used by this site${quota ? ` of ${formatBytes(quota)} available` : ""}.`;
        }
      } catch {
        // The estimate is optional.
      }
    }
    total.textContent = summary;
  }

  document.getElementById("storage-refresh").addEventListener("click", () => refreshStorage());
  document.getElementById("storage-clear-recent").addEventListener("click", () => {
    localStorage.removeItem("campgroundless.recent-searches.v1");
    refreshStorage();
    setMessage("Recent searches cleared.");
  });
  document.getElementById("storage-clear-files").addEventListener("click", async () => {
    if ("caches" in window) {
      const names = (await caches.keys()).filter((name) => name.startsWith("campgroundless-shell-"));
      await Promise.all(names.map((name) => caches.delete(name)));
    }
    await refreshStorage();
    setMessage("App file cache cleared. It refills the next time you load the map. Offline map areas were kept.");
  });

  const Backup = window.CampgroundlessBackup;
  const backupPreview = document.getElementById("backup-preview");
  const backupFile = document.getElementById("backup-file");
  const flashKey = "campgroundless.settings-message";
  let pendingBackup = null;

  // The build is the map script's cache-busting number, which changes with every deploy.
  function appBuild() {
    return /app\.js\?v=(\d+)/.exec(document.querySelector('script[src*="app.js"]')?.getAttribute("src") ?? "")?.[1] ?? null;
  }

  function plural(count, word, many = `${word}s`) {
    return `${count} ${count === 1 ? word : many}`;
  }

  document.getElementById("backup-export").addEventListener("click", async () => {
    const parts = new Set(
      [...form.querySelectorAll('input[name="backupPart"]:checked')].map((input) => input.value),
    );
    if (!parts.size) {
      setMessage("Choose at least one thing to include in the backup.", true);
      return;
    }
    const backup = Backup.create(
      {
        settings: parts.has("settings"),
        notes: parts.has("notes"),
        recent: parts.has("recent"),
        apiKeys: document.getElementById("backup-api-keys").checked,
      },
      { build: appBuild(), platform: window.CampgroundlessNative?.isNative ? "ios" : "web" },
    );
    const name = Backup.fileName();
    try {
      const result = await window.CampgroundlessNative.saveFile({
        name,
        text: JSON.stringify(backup, null, 2),
        title: "Campgroundless backup",
      });
      if (result === "dismissed") setMessage("");
      else if (result === "shared") setMessage(`Backup ready: ${name}`);
      else setMessage(`Backup downloaded: ${name}`);
    } catch (error) {
      console.error("Could not export backup.", error);
      setMessage(`Could not save the backup: ${error.message || error}`, true);
    }
  });

  document.getElementById("backup-import").addEventListener("click", () => {
    backupFile.value = "";
    backupFile.click();
  });

  backupFile.addEventListener("change", async () => {
    const file = backupFile.files?.[0];
    if (!file) return;
    try {
      pendingBackup = Backup.parse(await file.text());
    } catch (error) {
      pendingBackup = null;
      backupPreview.hidden = true;
      setMessage(error.message, true);
      return;
    }
    setMessage("");
    showPreview(pendingBackup, file.name);
  });

  function showPreview(backup, name) {
    const contents = [];
    if (backup.settings) contents.push(backup.includesApiKeys ? "settings (with API keys)" : "settings");
    if (backup.notes) contents.push(plural(backup.notes.length, "saved location"));
    if (backup.recentSearches) contents.push(plural(backup.recentSearches.length, "recent search", "recent searches"));
    const date = backup.exportedAt ? new Date(backup.exportedAt) : null;
    const when = date && !Number.isNaN(date.getTime()) ? `, exported ${date.toLocaleString()}` : "";
    const skipped = backup.skippedNotes ? ` ${plural(backup.skippedNotes, "saved location")} could not be read and will be skipped.` : "";
    document.getElementById("backup-preview-summary").textContent = `${name}${when}: ${contents.join(", ")}.${skipped}`;
    const present = { settings: Boolean(backup.settings), notes: Boolean(backup.notes), recent: Boolean(backup.recentSearches) };
    form.querySelectorAll("#backup-import-parts [data-part]").forEach((label) => {
      label.hidden = !present[label.dataset.part];
      label.querySelector("input").checked = present[label.dataset.part];
    });
    document.getElementById("backup-notes-count").textContent = backup.notes ? plural(backup.notes.length, "location") : "";
    document.getElementById("backup-recent-count").textContent = backup.recentSearches
      ? plural(backup.recentSearches.length, "search", "searches")
      : "";
    document.getElementById("backup-import-mode").hidden = !present.notes && !present.recent;
    form.querySelector('input[name="importMode"][value="merge"]').checked = true;
    const endpoints = Backup.changedEndpoints(backup);
    const warning = document.getElementById("backup-endpoint-warning");
    warning.hidden = !endpoints.length;
    warning.textContent = endpoints.length
      ? `These settings send map requests to a different service: ${endpoints.map((e) => `${e.label} (${e.value})`).join("; ")}. Import settings only from a file you trust.`
      : "";
    backupPreview.hidden = false;
    backupPreview.scrollIntoView({ block: "nearest" });
  }

  document.getElementById("backup-import-cancel").addEventListener("click", () => {
    pendingBackup = null;
    backupPreview.hidden = true;
  });

  document.getElementById("backup-import-confirm").addEventListener("click", () => {
    if (!pendingBackup) return;
    const parts = new Set(
      [...form.querySelectorAll('#backup-import-parts label:not([hidden]) input:checked')].map((input) => input.value),
    );
    if (!parts.size) {
      setMessage("Choose at least one thing to import.", true);
      return;
    }
    const mode = form.querySelector('input[name="importMode"]:checked').value;
    if (
      mode === "replace" &&
      (parts.has("notes") || parts.has("recent")) &&
      !window.confirm("Replace the saved locations and recent searches on this device with the ones in the file? This cannot be undone.")
    ) {
      return;
    }
    let result;
    try {
      result = Backup.apply(pendingBackup, {
        settings: parts.has("settings"),
        notes: parts.has("notes"),
        recent: parts.has("recent"),
        mode,
      });
    } catch (error) {
      setMessage(`Could not import the backup: ${error.message}`, true);
      return;
    }
    const done = [];
    if (result.settings) done.push("settings");
    if (result.notes !== null) done.push(`${plural(result.notes, "saved location")} now on this device`);
    if (result.recent !== null) done.push(plural(result.recent, "recent search", "recent searches"));
    try {
      sessionStorage.setItem("campgroundless.open-settings", "1");
      sessionStorage.setItem(flashKey, `Imported ${done.join(", ")}.`);
    } catch {
      // Reopening Settings after the reload is optional.
    }
    location.reload();
  });

  // ---- Location files (GPX, KML/KMZ, GeoJSON, CSV) ----
  const Places = window.CampgroundlessPlaces;
  const placesFile = document.getElementById("places-file");
  const placesPreview = document.getElementById("places-preview");
  let pendingPlaces = null;

  // Uses the map's state boundaries when they have loaded, otherwise the coverage bounding box.
  async function coverageCheck() {
    const mapApi = window.CampgroundlessMap;
    if (!mapApi?.isWithinCoverage) return () => true;
    await Promise.race([mapApi.whenCoverageReady(), new Promise((resolve) => setTimeout(resolve, 5000))]);
    return (lat, lng) => mapApi.isWithinCoverage(lat, lng);
  }

  document.getElementById("places-export").addEventListener("click", async () => {
    const notes = Places.readNotes();
    if (!notes.length) {
      setMessage("There are no saved locations to export yet.", true);
      return;
    }
    const format = document.getElementById("places-format").value;
    try {
      const file = Places.write(format, notes);
      const result = await window.CampgroundlessNative.saveFile({
        ...file,
        title: "Campgroundless saved locations",
      });
      const what = `${plural(notes.length, "location")} (${Places.formats[format].label})`;
      if (result === "dismissed") setMessage("Export cancelled.");
      else if (result === "shared") setMessage(`Exported ${what}: ${file.name}`);
      else setMessage(`Downloaded ${what}: ${file.name}`);
    } catch (error) {
      console.error("Could not export locations.", error);
      setMessage(`Could not export locations: ${error.message || error}`, true);
    }
  });

  document.getElementById("places-import").addEventListener("click", () => {
    placesFile.value = "";
    placesFile.click();
  });

  placesFile.addEventListener("change", async () => {
    const file = placesFile.files?.[0];
    if (!file) return;
    setMessage(`Reading ${file.name}…`);
    try {
      const read = await Places.read(file.name, new Uint8Array(await file.arrayBuffer()));
      const plan = Places.plan(read.places, { inCoverage: await coverageCheck() });
      pendingPlaces = plan.notes;
      showPlacesPreview(file.name, read, plan);
      setMessage("");
    } catch (error) {
      pendingPlaces = null;
      placesPreview.hidden = true;
      setMessage(error.message || String(error), true);
    }
  });

  function showPlacesPreview(name, read, plan) {
    const notes = [];
    if (plan.skipped.duplicate) notes.push(`${plan.skipped.duplicate} already saved`);
    if (plan.skipped.outside) notes.push(`${plan.skipped.outside} outside the map's coverage area`);
    if (read.invalid) notes.push(`${read.invalid} with unreadable coordinates`);
    const skipped = notes.length ? ` Skipping ${notes.join(", ")}.` : "";
    const ignored = read.ignored ? ` ${plural(read.ignored, "track, route, or area", "tracks, routes, or areas")} not imported.` : "";
    const shortened = plan.shortened ? ` ${plural(plan.shortened, "name or description")} will be shortened to fit.` : "";
    const found = read.places.length + read.invalid;
    document.getElementById("places-preview-summary").textContent =
      `${name} (${read.format}): ${plural(found, "location")} found, ${plan.notes.length} to add.${skipped}${ignored}${shortened}`;
    const list = document.getElementById("places-preview-list");
    list.replaceChildren(
      ...plan.notes.slice(0, 5).map((note) => {
        const item = document.createElement("li");
        item.textContent = note.title || note.body.slice(0, 60);
        return item;
      }),
    );
    if (plan.notes.length > 5) {
      const more = document.createElement("li");
      more.className = "more";
      more.textContent = `and ${plan.notes.length - 5} more`;
      list.append(more);
    }
    const confirm = document.getElementById("places-import-confirm");
    confirm.hidden = !plan.notes.length;
    confirm.textContent = `Add ${plural(plan.notes.length, "location")}`;
    document.getElementById("places-preview-heading").textContent = plan.notes.length
      ? "Add these locations?"
      : "Nothing new to add";
    placesPreview.hidden = false;
    placesPreview.scrollIntoView({ block: "nearest" });
  }

  document.getElementById("places-import-cancel").addEventListener("click", () => {
    pendingPlaces = null;
    placesPreview.hidden = true;
  });

  document.getElementById("places-import-confirm").addEventListener("click", () => {
    if (!pendingPlaces?.length) return;
    try {
      Places.add(pendingPlaces);
    } catch (error) {
      setMessage(`Could not add the locations: ${error.message}`, true);
      return;
    }
    try {
      sessionStorage.setItem("campgroundless.open-settings", "1");
      sessionStorage.setItem(flashKey, `Added ${plural(pendingPlaces.length, "saved location")}.`);
    } catch {
      // Reopening Settings after the reload is optional.
    }
    location.reload();
  });

  window.addEventListener("campgroundless:viewshow", (event) => {
    if (event.detail?.name !== "settings") return;
    setMessage("");
    loadForm(current());
    refreshStorage();
  });

  const build = appBuild();
  document.getElementById("app-build").textContent = build ? `Build ${build}` : "Build unknown";

  try {
    loadForm(current());
  } catch (error) {
    setMessage(`Could not load saved settings: ${error.message}`, true);
  }

  let reopen = location.hash === "#settings";
  try {
    reopen = reopen || sessionStorage.getItem("campgroundless.open-settings") === "1";
    sessionStorage.removeItem("campgroundless.open-settings");
  } catch {
    // Session storage is optional.
  }
  if (location.hash === "#settings") history.replaceState(null, "", location.pathname + location.search);
  if (reopen) window.CampgroundlessSidebar?.show("settings");
  try {
    const flash = sessionStorage.getItem(flashKey);
    sessionStorage.removeItem(flashKey);
    if (flash) setMessage(flash);
  } catch {
    // Session storage is optional.
  }
})();