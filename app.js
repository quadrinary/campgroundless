(() => {
  "use strict";

  const californiaBounds = L.latLngBounds(
    [32.4, -124.6],
    [42.1, -114.0],
  );
  const defaultLayerUrl =
    "https://services.arcgis.com/9ecg2KpMLcsUv1Oh/arcgis/rest/services/Land_Ownership/FeatureServer/39";
  const managersByGroup = {
    forest: ["USFS"],
    blm: ["BLM"],
    state: [
      "CITY",
      "CNTY",
      "REG",
      "RWD",
      "SDC",
      "SDNR",
      "SDOL",
      "SFW",
      "SPR",
      "OTHS",
    ],
    other: ["FWS", "NPS", "OTHF", "USACE", "USBR"],
  };
  const colorByManager = {
    USFS: "#33745b",
    BLM: "#c67b46",
    FWS: "#8776a8",
    NPS: "#8776a8",
    OTHF: "#8776a8",
    USACE: "#8776a8",
    USBR: "#8776a8",
  };
  const managerNames = {
    BLM: "Bureau of Land Management",
    CITY: "City government",
    CNTY: "County government",
    FWS: "U.S. Fish and Wildlife Service",
    NPS: "National Park Service",
    OTHF: "Other federal manager",
    OTHS: "Other state manager",
    REG: "Regional government",
    RWD: "Regional water district",
    SDC: "State conservation agency",
    SDNR: "State natural resources agency",
    SDOL: "State lands agency",
    SFW: "State fish and wildlife agency",
    SPR: "State park or recreation agency",
    USACE: "U.S. Army Corps of Engineers",
    USBR: "U.S. Bureau of Reclamation",
    USFS: "U.S. Forest Service",
  };

  let settings;
  try {
    settings = window.CampgroundlessSettings.read();
  } catch (error) {
    console.error("Could not read map settings.", error);
    settings = structuredClone(window.CampgroundlessSettings.defaults);
  }

  const mapStatus = document.getElementById("map-status");
  const mapLoading = document.getElementById("map-loading");
  const searchMessage = document.getElementById("search-message");
  const dataSourceLabel = document.getElementById("map-data-source-label");
  const sourceLayerNote = document.getElementById("source-layer-note");
  const map = L.map("map", {
    zoomControl: false,
    minZoom: 5,
    maxZoom: 14,
    maxBounds: californiaBounds.pad(0.14),
    maxBoundsViscosity: 0.7,
  }).fitBounds(californiaBounds);

  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.control.scale({ imperial: true, metric: false, position: "bottomleft" }).addTo(map);
  function createBasemap() {
    const basemapOptions = {
      maxZoom: 19,
      attribution: "",
    };
    let url;
    if (settings.basemap === "osm") {
      url = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
      basemapOptions.attribution =
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
      basemapOptions.maxZoom = 19;
    } else if (settings.basemap === "custom" && settings.basemapUrl) {
      const apiKey = encodeURIComponent(settings.customBasemapApiKey);
      url = settings.basemapUrl
        .replaceAll("{apiKey}", apiKey)
        .replaceAll("{z}", "{z}")
        .replaceAll("{x}", "{x}")
        .replaceAll("{y}", "{y}");
      if (settings.customBasemapApiKey && !settings.basemapUrl.includes("{apiKey}")) {
        url += `${url.includes("?") ? "&" : "?"}apiKey=${apiKey}`;
      }
      basemapOptions.attribution = escapeHtml(
        settings.basemapAttribution || "Custom XYZ tile provider",
      );
    } else {
      url =
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
      if (settings.esriApiKey) {
        url += `?token=${encodeURIComponent(settings.esriApiKey)}`;
      }
      basemapOptions.attribution =
        '&copy; Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, OpenStreetMap contributors, and the GIS User Community';
    }
    return L.tileLayer(url, basemapOptions).addTo(map);
  }

  createBasemap();

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character];
    });
  }

  function buildWhere(layers = settings.layers) {
    const enabledGroups = Object.keys(managersByGroup)
      .filter((group) => layers[group]);
    const managers = [...new Set(enabledGroups.flatMap((group) => managersByGroup[group]))];
    if (managers.length === 0) {
      return "1=0";
    }
    const quotedManagers = managers.map((manager) => `'${manager}'`).join(",");
    return `State_Nm = 'CA' AND FeatClass = 'Fee' AND Mang_Name IN (${quotedManagers})`;
  }

  function featureStyle(feature) {
    const manager = feature?.properties?.Mang_Name;
    return {
      color: colorByManager[manager] ?? "#5b91ae",
      weight: 1,
      opacity: 0.82,
      fillColor: colorByManager[manager] ?? "#5b91ae",
      fillOpacity: 0.2,
    };
  }

  function createPopup(feature, layer) {
    const properties = feature.properties ?? {};
    const managerCode = properties.Mang_Name;
    const manager = managerNames[managerCode] ?? "Public land manager (not specified)";
    const unit = properties.Unit_Nm || properties.Loc_Nm || "Unnamed land unit";
    const access = properties.Pub_Access;
    const sourceDate = properties.Src_Date;
    const accessText = access ? escapeHtml(access) : "Not provided";
    const sourceDateText = sourceDate ? escapeHtml(sourceDate) : "Not provided";
    const popup = `
      <div class="map-popup">
        <div class="map-popup-label">${escapeHtml(manager)}</div>
        <h3>${escapeHtml(unit)}</h3>
        <p>Public-access field: <strong>${accessText}</strong></p>
        <p>Source date recorded: ${sourceDateText}</p>
        <p class="popup-warning">Camping permission is not determined here. Contact this land manager before camping.</p>
      </div>`;
    layer.bindPopup(popup, { maxWidth: 260 });
  }

  const dataSourceUrl =
    settings.dataSource === "custom" && settings.dataUrl
      ? settings.dataUrl
      : defaultLayerUrl;
  if (settings.dataSource === "custom" && settings.dataUrl) {
    dataSourceLabel.textContent = "Custom ArcGIS Feature Layer";
    sourceLayerNote.textContent =
      "This custom layer is managed by its provider. Verify its metadata, attribution requirements, accuracy, and update date with that provider; a compatible schema still does not indicate camping permission.";
  }
  const landLayerOptions = {
    url: dataSourceUrl,
    where: buildWhere(),
    token: settings.dataApiKey || undefined,
    attribution:
      settings.dataSource === "custom"
        ? escapeHtml(settings.dataAttribution || "Land data: custom ArcGIS Feature Layer")
        : "Land data: USGS GAP, PAD-US 3.0",
    fields: [
      "FID",
      "FeatClass",
      "Mang_Name",
      "Unit_Nm",
      "Loc_Nm",
      "Pub_Access",
      "Src_Date",
    ],
    simplifyFactor: 0.35,
    precision: 5,
    minZoom: 5,
    style: featureStyle,
    onEachFeature: createPopup,
  };
  const landLayer = L.esri.featureLayer(landLayerOptions);

  landLayer.on("load", () => {
    mapLoading.hidden = true;
    mapStatus.textContent =
      settings.dataSource === "custom"
        ? "Custom land boundaries loaded"
        : "Public land boundaries loaded · PAD-US 3.0";
    mapStatus.classList.remove("error");
    refreshSearchableFeatures();
  });

  landLayer.on("requesterror", () => {
    mapLoading.hidden = true;
    mapStatus.textContent = "Land data unavailable · try again later";
    mapStatus.classList.add("error");
  });

  landLayer.addTo(map);

  document.querySelectorAll('input[name="manager"]').forEach((checkbox) => {
    checkbox.checked = Boolean(settings.layers[checkbox.value]);
    checkbox.addEventListener("change", () => {
      settings.layers[checkbox.value] = checkbox.checked;
      try {
        window.CampgroundlessSettings.write(settings);
      } catch (error) {
        console.error("Could not save layer preferences.", error);
        searchMessage.textContent =
          "Could not save layer preferences in this browser. Check storage settings.";
      }
      mapStatus.textContent = "Updating land boundaries…";
      landLayer.setWhere(buildWhere(settings.layers));
    });
  });

  function refreshSearchableFeatures() {
    const searchableFeatures = [];
    map.eachLayer((featureLayer) => {
      if (featureLayer.feature?.properties) {
        searchableFeatures.push(featureLayer);
      }
    });
    return searchableFeatures;
  }

  function searchLoadedFeatures() {
    const term = document.getElementById("place-search").value.trim().toLocaleLowerCase();
    if (!term) {
      searchMessage.textContent = "Enter a land-unit name to search loaded map features.";
      return;
    }
    const match = refreshSearchableFeatures().find((featureLayer) => {
      const properties = featureLayer.feature.properties;
      const searchableText = [
        properties.Unit_Nm,
        properties.Loc_Nm,
        properties.Mang_Name,
      ].join(" ").toLocaleLowerCase();
      return searchableText.includes(term);
    });
    if (!match) {
      searchMessage.textContent = "No matching unit is loaded. Zoom or pan to another area, then try again.";
      return;
    }
    const bounds = match.getBounds?.();
    if (bounds?.isValid()) {
      map.fitBounds(bounds.pad(0.15), { maxZoom: 10 });
      match.openPopup();
      searchMessage.textContent = `Showing ${match.feature.properties.Unit_Nm || "the matching unit"}.`;
    } else {
      searchMessage.textContent = "That land unit has no mappable boundary in the current view.";
    }
  }

  document.getElementById("search-submit").addEventListener("click", searchLoadedFeatures);
  document.getElementById("place-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchLoadedFeatures();
    }
  });

  document.getElementById("locate-button").addEventListener("click", () => {
    map.locate({ setView: true, maxZoom: 10, enableHighAccuracy: false });
  });

  map.on("locationfound", (event) => {
    L.circleMarker(event.latlng, {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: "#315a43",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindPopup("Your location (only visible in this browser)");
  });

  map.on("locationerror", () => {
    searchMessage.textContent = "Location access was unavailable. Check your browser permission and try again.";
  });

  document.getElementById("reset-button").addEventListener("click", () => {
    map.fitBounds(californiaBounds);
    document.getElementById("place-search").value = "";
    searchMessage.textContent = "Search the land units currently loaded on the map.";
  });
})();
