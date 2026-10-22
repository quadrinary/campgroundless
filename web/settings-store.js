(() => {
  "use strict";

  const storageKey = "campgroundless.settings.v1";
  const defaults = {
    dataSource: "padus",
    dataUrl: "",
    dataApiKey: "",
    dataAttribution: "",
    placeSearchUrl: "https://nominatim.openstreetmap.org/search",
    layers: {
      forest: true,
      blm: true,
      state: true,
      other: true,
    },
    overlays: {
      fsRecreation: false,
      blmRecreation: false,
      fsRoads: false,
      fsClosedRoads: false,
      fsTrails: false,
      fsMvum: false,
      blmPublicRoads: false,
      blmLimitedRoads: false,
    },
    recreationSitesMinZoom: 11,
    showLandDisclaimer: true,
    showBoundaryData: true,
    basemap: "vector",
    osmLayer: "standard",
    theme: "auto",
    popupClickBehavior: "close",
    basemapUrl: "",
    basemapAttribution: "",
    esriApiKey: "",
    customBasemapApiKey: "",
    typography: {
      body: 12,
      search: 11,
      caption: 10,
      map: 100,
    },
  };
  const typographyOptions = {
    body: { min: 7, max: 17 },
    search: { min: 6, max: 16 },
    caption: { min: 5, max: 15 },
    map: { min: 50, max: 200 },
  };
  const osmLayers = ["standard", "hot", "topographic"];
  const themes = ["auto", "light", "dark"];
  const recreationSiteZoomLevels = [11, 12, 13, 14, 15];

  function normalizeRecreationSitesMinZoom(zoom) {
    const normalizedZoom = Number(zoom);
    return recreationSiteZoomLevels.includes(normalizedZoom)
      ? normalizedZoom
      : defaults.recreationSitesMinZoom;
  }

  function normalizeOsmLayer(layer) {
    return osmLayers.includes(layer) ? layer : defaults.osmLayer;
  }

  function normalizeTheme(theme) {
    return themes.includes(theme) ? theme : defaults.theme;
  }

  function normalizePopupClickBehavior(value) {
    return value === "replace" ? "replace" : "close";
  }

  function normalizeOverlays(overlays = {}) {
    if (!overlays || typeof overlays !== "object") {
      overlays = {};
    }
    return Object.fromEntries(
      Object.keys(defaults.overlays).map((name) => [name, overlays[name] === true]),
    );
  }

  function normalizeTypography(typography = {}) {
    if (!typography || typeof typography !== "object") {
      typography = {};
    }
    return Object.fromEntries(
      Object.entries(typographyOptions).map(([name, values]) => [
        name,
        Number.isInteger(Number(typography[name])) &&
          Number(typography[name]) >= values.min &&
          Number(typography[name]) <= values.max
          ? Number(typography[name])
          : defaults.typography[name],
      ]),
    );
  }

  function read() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return structuredClone(defaults);
    }

    try {
      const saved = JSON.parse(raw);
      return {
        ...defaults,
        ...saved,
        layers: { ...defaults.layers, ...(saved.layers ?? {}) },
        overlays: normalizeOverlays(saved.overlays),
        recreationSitesMinZoom: normalizeRecreationSitesMinZoom(
          saved.recreationSitesMinZoom,
        ),
        osmLayer: normalizeOsmLayer(saved.osmLayer),
        theme: normalizeTheme(saved.theme),
        popupClickBehavior: normalizePopupClickBehavior(saved.popupClickBehavior),
        showLandDisclaimer: saved.showLandDisclaimer !== false,
        showBoundaryData: saved.showBoundaryData !== false,
        typography: normalizeTypography(saved.typography),
      };
    } catch (error) {
      console.error("Could not read saved map settings.", error);
      return structuredClone(defaults);
    }
  }

  function write(settings) {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...settings,
        overlays: normalizeOverlays(settings.overlays),
        recreationSitesMinZoom: normalizeRecreationSitesMinZoom(
          settings.recreationSitesMinZoom,
        ),
        osmLayer: normalizeOsmLayer(settings.osmLayer),
        theme: normalizeTheme(settings.theme),
        popupClickBehavior: normalizePopupClickBehavior(settings.popupClickBehavior),
        showLandDisclaimer: settings.showLandDisclaimer !== false,
        showBoundaryData: settings.showBoundaryData !== false,
        typography: normalizeTypography(settings.typography),
      }),
    );
  }

  function applyTypography(settings) {
    const typography = normalizeTypography(settings.typography);
    document.documentElement.style.setProperty("--font-body-size", `${typography.body}px`);
    document.documentElement.style.setProperty("--font-search-size", `${typography.search}px`);
    document.documentElement.style.setProperty("--font-caption-size", `${typography.caption}px`);
  }

  // Scales a MapLibre text-size value (number, legacy stops, or expression) by factor.
  // Zoom-based interpolate/step expressions must stay top-level, so their outputs are scaled instead.
  function scaleMapTextSize(value, factor) {
    const scale = (output) => (typeof output === "number"
      ? Math.round(output * factor * 100) / 100
      : ["*", output, factor]);
    if (value === undefined || value === null) return scale(16);
    if (typeof value === "number") return scale(value);
    if (Array.isArray(value)) {
      if (value[0] === "interpolate" || value[0].startsWith?.("interpolate-")) {
        return value.map((part, index) => (index > 3 && index % 2 === 0 ? scale(part) : part));
      }
      if (value[0] === "step") {
        return value.map((part, index) => (index >= 2 && index % 2 === 0 ? scale(part) : part));
      }
      return scale(value);
    }
    if (typeof value === "object" && Array.isArray(value.stops)) {
      return { ...value, stops: value.stops.map(([input, output]) => [input, scale(output)]) };
    }
    return value;
  }

  function validateHttpUrl(value, label) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${label} must be a valid HTTPS URL.`);
    }
    if (url.protocol !== "https:") {
      throw new Error(`${label} must use HTTPS.`);
    }
  }

  window.CampgroundlessSettings = Object.freeze({
    storageKey,
    defaults,
    read,
    write,
    applyTypography,
    scaleMapTextSize,
    validateHttpUrl,
  });
})();
