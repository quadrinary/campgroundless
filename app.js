(() => {
  "use strict";

  const californiaBounds = L.latLngBounds(
    [32.4, -124.6],
    [42.1, -114.0],
  );
  const layerUrl =
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

  const mapStatus = document.getElementById("map-status");
  const mapLoading = document.getElementById("map-loading");
  const searchMessage = document.getElementById("search-message");
  const map = L.map("map", {
    zoomControl: false,
    minZoom: 5,
    maxZoom: 14,
    maxBounds: californiaBounds.pad(0.14),
    maxBoundsViscosity: 0.7,
  }).fitBounds(californiaBounds);

  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.control.scale({ imperial: true, metric: false, position: "bottomleft" }).addTo(map);
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        '&copy; Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, OpenStreetMap contributors, and the GIS User Community',
      maxZoom: 19,
    },
  ).addTo(map);

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

  function buildWhere() {
    const enabledGroups = [...document.querySelectorAll('input[name="manager"]:checked')]
      .map((checkbox) => checkbox.value)
      .filter((group) => Object.hasOwn(managersByGroup, group));
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
        <p>PAD-US public-access field: <strong>${accessText}</strong></p>
        <p>Source date recorded: ${sourceDateText}</p>
        <p class="popup-warning">Camping permission is not determined here. Contact this land manager before camping.</p>
      </div>`;
    layer.bindPopup(popup, { maxWidth: 260 });
  }

  const landLayer = L.esri.featureLayer({
    url: layerUrl,
    where: buildWhere(),
    attribution: "Land data: USGS GAP, PAD-US 3.0",
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
  });

  landLayer.on("load", () => {
    mapLoading.hidden = true;
    mapStatus.textContent = "Public land boundaries loaded · PAD-US 3.0";
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
    checkbox.addEventListener("change", () => {
      mapStatus.textContent = "Updating land boundaries…";
      landLayer.setWhere(buildWhere());
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
