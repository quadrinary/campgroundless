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
      basemap: form.elements.basemap.value,
      osmLayer: form.elements.osmLayer.value,
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
    Object.keys(layerNames).forEach((layer) => {
      form.querySelector(`input[name="layer"][value="${layer}"]`).checked = Boolean(settings.layers[layer]);
    });
    form.elements.basemap.value = settings.basemap;
    form.elements.osmLayer.value = settings.osmLayer;
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
    document.getElementById("summary-basemap").textContent =
      settings.basemap === "osm"
        ? `OpenStreetMap · ${osmLayerNames[settings.osmLayer] ?? osmLayerNames.standard}`
        : ({ esri: "Esri World Street Map", custom: "Custom XYZ tiles" })[settings.basemap];
    document.getElementById("summary-place-search").textContent =
      settings.placeSearchUrl === Settings.defaults.placeSearchUrl
        ? "OpenStreetMap Nominatim"
        : "Custom Nominatim-compatible service";
    document.getElementById("summary-typography").textContent =
      `${settings.typography.body} / ${settings.typography.search} / ${settings.typography.caption} px`;
    document.getElementById("summary-keys").textContent =
      selectedKeys === 0 ? "None saved" : `${selectedKeys} saved in this browser`;
  }

  form.addEventListener("change", () => {
    const settings = currentFormSettings();
    Settings.applyTypography(settings);
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

  try {
    loadForm(Settings.read());
  } catch (error) {
    setMessage(`Could not load saved settings: ${error.message}`, true);
  }
})();
