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
    basemap: "esri",
    basemapUrl: "",
    basemapAttribution: "",
    esriApiKey: "",
    customBasemapApiKey: "",
  };

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
      };
    } catch (error) {
      console.error("Could not read saved map settings.", error);
      return structuredClone(defaults);
    }
  }

  function write(settings) {
    localStorage.setItem(storageKey, JSON.stringify(settings));
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
    validateHttpUrl,
  });
})();
