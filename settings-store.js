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
      fsRoads: false,
      fsClosedRoads: false,
      fsTrails: false,
      fsMvum: false,
      blmPublicRoads: false,
      blmLimitedRoads: false,
    },
    basemap: "esri",
    osmLayer: "standard",
    basemapUrl: "",
    basemapAttribution: "",
    esriApiKey: "",
    customBasemapApiKey: "",
    typography: {
      body: 12,
      search: 11,
      caption: 10,
    },
  };
  const typographyOptions = {
    body: { min: 7, max: 17 },
    search: { min: 6, max: 16 },
    caption: { min: 5, max: 15 },
  };
  const osmLayers = ["standard", "hot", "topographic"];

  function normalizeOsmLayer(layer) {
    return osmLayers.includes(layer) ? layer : defaults.osmLayer;
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
        osmLayer: normalizeOsmLayer(saved.osmLayer),
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
        osmLayer: normalizeOsmLayer(settings.osmLayer),
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
    validateHttpUrl,
  });
})();
