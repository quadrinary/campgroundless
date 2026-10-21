(() => {
  "use strict";

  const Settings = window.CampgroundlessSettings;
  const form = document.getElementById("settings-form");
  const message = document.getElementById("settings-message");
  const layerNames = {
    forest: "Forest Service",
    blm: "BLM",
    state: "State & local",
    other: "Other federal",
  };

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
  }

  function currentFormSettings() {
    const layers = Object.fromEntries(
      Object.keys(layerNames).map((name) => [
        name,
        form.querySelector(`input[name="layer"][value="${name}"]`).checked,
      ]),
    );
    return {
      dataSource: form.querySelector('input[name="dataSource"]:checked').value,
      dataUrl: form.elements.dataUrl.value.trim(),
      dataApiKey: form.elements.dataApiKey.value.trim(),
      dataAttribution: form.elements.dataAttribution.value.trim(),
      placeSearchUrl: form.elements.placeSearchUrl.value.trim(),
      layers,
      recreationSitesMinZoom: Number(form.elements.recreationSitesMinZoom.value),
      showLandDisclaimer: form.elements.showLandDisclaimer.checked,
      showBoundaryData: form.elements.showBoundaryData.checked,
      basemap: form.elements.basemap.value,
      osmLayer: form.elements.osmLayer.value,
      theme: form.elements.theme.value,
      popupClickBehavior: form.elements.popupClickBehavior.value,
      basemapUrl: form.elements.basemapUrl.value.trim(),
      basemapAttribution: form.elements.basemapAttribution.value.trim(),
      esriApiKey: form.elements.esriApiKey.value.trim(),
      customBasemapApiKey: form.elements.customBasemapApiKey.value.trim(),
      typography: {
        body: Number(form.elements.fontBodySize.value),
        search: Number(form.elements.fontSearchSize.value),
        caption: Number(form.elements.fontCaptionSize.value),
      },
    };
  }

  function validate(settings) {
    Settings.validateHttpUrl(settings.placeSearchUrl, "Place search endpoint");
    if (settings.dataSource === "custom") {
      Settings.validateHttpUrl(settings.dataUrl, "Feature Layer URL");
      if (!/\/FeatureServer\/\d+\/?$/i.test(new URL(settings.dataUrl).pathname)) {
        throw new Error("Feature Layer URL must end with /FeatureServer/{layer-number}.");
      }
    }
    if (settings.basemap === "custom") {
      const template = settings.basemapUrl;
      if (!template.includes("{z}") || !template.includes("{x}") || !template.includes("{y}")) {
        throw new Error("Custom basemap URL must include {z}, {x}, and {y}.");
      }
      Settings.validateHttpUrl(
        template.replaceAll("{z}", "1").replaceAll("{x}", "1").replaceAll("{y}", "1").replaceAll("{apiKey}", "key"),
        "Custom basemap URL",
      );
    }
  }

  function loadForm(settings) {
    form.querySelector(`input[name="dataSource"][value="${settings.dataSource}"]`).checked = true;
    form.elements.dataUrl.value = settings.dataUrl;
    form.elements.dataApiKey.value = settings.dataApiKey;
    form.elements.dataAttribution.value = settings.dataAttribution;
    form.elements.placeSearchUrl.value = settings.placeSearchUrl;
    form.elements.recreationSitesMinZoom.value = settings.recreationSitesMinZoom;
    form.elements.showLandDisclaimer.checked = settings.showLandDisclaimer !== false;
    form.elements.showBoundaryData.checked = settings.showBoundaryData !== false;
    Object.keys(layerNames).forEach((layer) => {
      form.querySelector(`input[name="layer"][value="${layer}"]`).checked = Boolean(settings.layers[layer]);
    });
    form.elements.basemap.value = settings.basemap;
    form.elements.osmLayer.value = settings.osmLayer;
    form.elements.theme.value = settings.theme;
    form.elements.popupClickBehavior.value = settings.popupClickBehavior;
    window.CampgroundlessTheme.apply(settings.theme);
    form.elements.basemapUrl.value = settings.basemapUrl;
    form.elements.basemapAttribution.value = settings.basemapAttribution;
    form.elements.esriApiKey.value = settings.esriApiKey;
    form.elements.customBasemapApiKey.value = settings.customBasemapApiKey;
    form.elements.fontBodySize.value = settings.typography.body;
    form.elements.fontSearchSize.value = settings.typography.search;
    form.elements.fontCaptionSize.value = settings.typography.caption;
    updateTypographyValues(settings.typography);
    Settings.applyTypography(settings);
    updateConditionalFields();
    updateSummary(settings);
  }

  function updateTypographyValues(typography) {
    document.getElementById("font-body-value").textContent = `${typography.body} px`;
    document.getElementById("font-search-value").textContent = `${typography.search} px`;
    document.getElementById("font-caption-value").textContent = `${typography.caption} px`;
  }

  function updateConditionalFields() {
    document.getElementById("custom-data-fields").hidden =
      form.querySelector('input[name="dataSource"]:checked').value !== "custom";
    document.getElementById("custom-data-attribution-field").hidden =
      form.querySelector('input[name="dataSource"]:checked').value !== "custom";
    document.getElementById("custom-basemap-fields").hidden =
      form.elements.basemap.value !== "custom";
    document.getElementById("osm-layer-fields").hidden =
      form.elements.basemap.value !== "osm";
    document.getElementById("custom-basemap-attribution-field").hidden =
      form.elements.basemap.value !== "custom";
  }

  function updateSummary(settings) {
    const selectedLayers = Object.keys(layerNames).filter((layer) => settings.layers[layer]);
    const selectedKeys = [
      settings.dataApiKey,
      settings.esriApiKey,
      settings.customBasemapApiKey,
    ].filter(Boolean).length;
    document.getElementById("summary-source").textContent =
      settings.dataSource === "custom" ? "Custom ArcGIS layer" : "USGS PAD-US 3.0";
    document.getElementById("summary-layers").textContent =
      `${selectedLayers.length} selected${selectedLayers.length ? ` · ${selectedLayers.map((layer) => layerNames[layer]).join(", ")}` : ""}`;
    const osmLayerNames = {
      standard: "Standard",
      hot: "Humanitarian (HOT)",
      topographic: "Topographic",
    };
    const basemapNames = {
      vector: "Vector streets (OpenFreeMap)",
      esri: "Esri World Street Map",
      "esri-imagery": "Esri World Imagery",
      "esri-hillshade": "Esri World Hillshade",
      "usgs-topo": "USGS Topographic Map",
      custom: "Custom XYZ tiles",
    };
    document.getElementById("summary-basemap").textContent =
      settings.basemap === "osm"
        ? `OpenStreetMap · ${osmLayerNames[settings.osmLayer] ?? osmLayerNames.standard}`
        : basemapNames[settings.basemap] ?? basemapNames.vector;
    document.getElementById("summary-place-search").textContent =
      settings.placeSearchUrl === Settings.defaults.placeSearchUrl
        ? "OpenStreetMap Nominatim"
        : "Custom Nominatim-compatible service";
    document.getElementById("summary-recreation-sites").textContent =
      `Zoom ${settings.recreationSitesMinZoom}+`;
    document.getElementById("summary-typography").textContent =
      `${settings.typography.body} / ${settings.typography.search} / ${settings.typography.caption} px`;
    document.getElementById("summary-keys").textContent =
      selectedKeys === 0 ? "None saved" : `${selectedKeys} saved in this browser`;
  }

  form.addEventListener("change", () => {
    const settings = currentFormSettings();
    Settings.applyTypography(settings);
    window.CampgroundlessTheme.apply(settings.theme);
    updateConditionalFields();
    updateSummary(settings);
    setMessage("");
  });

  form.addEventListener("input", () => {
    const settings = currentFormSettings();
    Settings.applyTypography(settings);
    updateTypographyValues(settings.typography);
    updateSummary(settings);
    setMessage("");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const settings = currentFormSettings();
      validate(settings);
      Settings.write(settings);
      updateSummary(settings);
      setMessage("Settings saved in this browser. Return to the map to apply them.");
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.querySelectorAll("[data-reveal]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.reveal);
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.textContent = reveal ? "Hide" : "Show";
      button.setAttribute("aria-label", `${reveal ? "Hide" : "Show"} ${input.labels?.[0]?.textContent ?? "API key"}`);
    });
  });

  document.getElementById("reset-settings").addEventListener("click", () => {
    const defaults = structuredClone(Settings.defaults);
    try {
      Settings.write(defaults);
      loadForm(defaults);
      setMessage("Settings reset to defaults. Saved API keys were removed.");
    } catch (error) {
      setMessage(`Could not reset settings: ${error.message}`, true);
    }
  });

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
    const cache = isNativeApp ? { bytes: 0, files: 0, supported: false } : await appCacheStats();
    if (!isNativeApp) rows.push({
      label: "App file cache",
      note: cache.supported ? "Page, script and icon copies kept for faster, offline-capable launches" : "Not supported in this browser",
      bytes: cache.bytes,
      items: cache.supported ? cache.files : null,
    });
    const offline = window.CampgroundlessOffline;
    if (offline?.supported) {
      const packs = await offline.listPacks().catch(() => []);
      rows.push({
        label: "Offline map areas",
        note: "Maps saved for use without a connection · manage them in Offline maps on the map page",
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
    let summary = `Total tracked here: ${formatBytes(sum)}.`;
    if (navigator.storage?.estimate && !isNativeApp) {
      try {
        const { usage, quota } = await navigator.storage.estimate();
        if (usage !== undefined) {
          summary += ` Browser reports ${formatBytes(usage)} used by this site${quota ? ` of ${formatBytes(quota)} available` : ""}.`;
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
  document.getElementById("reset-settings").addEventListener("click", () => setTimeout(refreshStorage, 0));
  refreshStorage();

  // The build is the map script's cache-busting number in index.html, which changes with every deploy.
  fetch("./index.html", { cache: "no-store" })
    .then((response) => response.text())
    .then((html) => {
      const build = /app\.js\?v=(\d+)/.exec(html)?.[1];
      document.getElementById("app-build").textContent = build ? `Build ${build}` : "Build unknown";
    })
    .catch(() => {
      document.getElementById("app-build").textContent = "Build unavailable";
    });

  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";
  document.body.append(probe);
  const probeStyle = getComputedStyle(probe);
  document.getElementById("app-build").parentElement.append(
    ` · display ${window.navigator.standalone ? "standalone" : "browser"}, inset ${probeStyle.paddingTop}/${probeStyle.paddingBottom}, view ${innerWidth}x${innerHeight}, screen ${screen.width}x${screen.height}`
  );
  probe.remove();

  try {
    loadForm(Settings.read());
  } catch (error) {
    setMessage(`Could not load saved settings: ${error.message}`, true);
  }
})();
