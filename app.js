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
  window.CampgroundlessSettings.applyTypography(settings);

  const mapStatus = document.getElementById("map-status");
  const mapLoading = document.getElementById("map-loading");
  const searchMessage = document.getElementById("search-message");
  const searchInput = document.getElementById("place-search");
  const searchSubmit = document.getElementById("search-submit");
  const searchResults = document.getElementById("search-results");
  const dataSourceLabel = document.getElementById("map-data-source-label");
  const sourceLayerNote = document.getElementById("source-layer-note");
  const searchMarkers = L.layerGroup();
  const noteMarkers = L.layerGroup();
  const sharedNoteMarkers = L.layerGroup();
  const noteForm = document.getElementById("map-note-form");
  const noteTitle = document.getElementById("map-note-title");
  const noteIcon = document.getElementById("map-note-icon");
  const noteBody = document.getElementById("map-note-body");
  const noteLocation = document.getElementById("map-note-location");
  const noteMessage = document.getElementById("map-note-message");
  const noteCount = document.getElementById("map-note-count");
  const sharedNoteNotice = document.getElementById("shared-note-notice");
  const notesStorageKey = "campgroundless.map-notes.v1";
  const noteTypes = {
    camp: { label: "Campsite", icon: "🏕️", category: "Camping" },
    water: { label: "Water", icon: "💧", category: "Camping" },
    fire: { label: "Campfire area", icon: "🔥", category: "Camping" },
    wildlife: { label: "Wildlife", icon: "🐻", category: "Camping" },
    trail: { label: "Trail", icon: "🥾", category: "Travel" },
    road: { label: "Road / access", icon: "🚙", category: "Travel" },
    fuel: { label: "Fuel", icon: "⛽", category: "Travel" },
    food: { label: "Food", icon: "🍽️", category: "Travel" },
    viewpoint: { label: "Viewpoint", icon: "🏞️", category: "Landmarks" },
    landmark: { label: "Landmark", icon: "📍", category: "Landmarks" },
    photo: { label: "Photo spot", icon: "📷", category: "Landmarks" },
  };
  const noteIconOptions = ["Camping", "Travel", "Landmarks"]
    .map((category) => {
      const options = Object.entries(noteTypes)
        .filter(([, type]) => type.category === category)
        .map(([value, type]) => `<option value="${value}">${type.icon} ${type.label}</option>`)
        .join("");
      return `<optgroup label="${category}">${options}</optgroup>`;
    })
    .join("");
  const placeSearchCache = new Map();
  let lastPlaceSearchAt = 0;
  let placeSearchInProgress = false;
  let selectedNoteLocation = null;
  let editingNoteId = null;
  let notes = [];
  const map = L.map("map", {
    zoomControl: false,
    minZoom: 5,
    maxZoom: 18,
    maxBounds: californiaBounds.pad(0.14),
    maxBoundsViscosity: 0.7,
  }).fitBounds(californiaBounds);

  L.control.scale({ imperial: true, metric: false, position: "bottomleft" }).addTo(map);
  searchMarkers.addTo(map);
  noteMarkers.addTo(map);
  sharedNoteMarkers.addTo(map);
  const referencePane = map.createPane("referenceOverlays");
  referencePane.style.zIndex = "420";
  referencePane.style.pointerEvents = "none";
  function createBasemap() {
    const basemapOptions = {
      maxZoom: 19,
      attribution: "",
    };
    let url;
    if (settings.basemap === "osm") {
      if (settings.osmLayer === "hot") {
        url = "https://tile.openstreetmap.fr/hot/{z}/{x}/{y}.png";
        basemapOptions.attribution =
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles style by <a href="https://www.hotosm.org/">Humanitarian OpenStreetMap Team</a>';
        basemapOptions.maxZoom = 19;
      } else if (settings.osmLayer === "topographic") {
        url = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
        basemapOptions.attribution =
          'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org/">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)';
        basemapOptions.subdomains = "abc";
        basemapOptions.maxNativeZoom = 17;
        basemapOptions.maxZoom = 18;
      } else {
        url = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
        basemapOptions.attribution =
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
        basemapOptions.maxZoom = 19;
      }
    } else if (settings.basemap === "esri-imagery") {
      url =
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      if (settings.esriApiKey) {
        url += `?token=${encodeURIComponent(settings.esriApiKey)}`;
      }
      basemapOptions.attribution =
        "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community";
    } else if (settings.basemap === "esri-hillshade") {
      url =
        "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}";
      if (settings.esriApiKey) {
        url += `?token=${encodeURIComponent(settings.esriApiKey)}`;
      }
      basemapOptions.attribution =
        "Sources: Esri, Vantor, Airbus DS, USGS, NGA, NASA, CGIAR, N Robinson, NCEAS, NLS, OS, NMA, Geodatastyrelsen, Rijkswaterstaat, GSA, Geoland, FEMA, Intermap, and the GIS user community";
    } else if (settings.basemap === "usgs-topo") {
      url = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
      basemapOptions.maxNativeZoom = 16;
      basemapOptions.maxZoom = 18;
      basemapOptions.attribution =
        'USGS The National Map; data sources include USGS, U.S. Census Bureau, USFS, NOAA, and others · <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">The National Map</a>';
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
    return L.tileLayer(url, basemapOptions);
  }

  let basemapLayer = createBasemap().addTo(map);

  function activeBasemapOption() {
    if (settings.basemap === "custom" && settings.basemapUrl) {
      return "custom";
    }
    return settings.basemap === "osm" ? `osm:${settings.osmLayer}` : settings.basemap;
  }

  function applyBasemapOption(option) {
    if (option === "custom" && settings.basemapUrl) {
      settings.basemap = "custom";
    } else if (option.startsWith("osm:")) {
      settings.basemap = "osm";
      settings.osmLayer = option.slice("osm:".length);
    } else {
      settings.basemap = option;
    }

    layerStatus.textContent = "";
    try {
      window.CampgroundlessSettings.write(settings);
    } catch (error) {
      console.error("Could not save basemap preference.", error);
      layerStatus.textContent = "Style changed for this visit, but could not be saved.";
    }

    map.removeLayer(basemapLayer);
    basemapLayer = createBasemap().addTo(map);
  }

  let layerStatus;
  const activeRoadOverlays = new Map();
  const layerControl = L.control({ position: "bottomright" });
  layerControl.onAdd = () => {
    const container = L.DomUtil.create("div", "leaflet-control map-layer-control");
    const button = L.DomUtil.create(
      "button",
      "map-layer-toggle leaflet-control-layers-toggle",
      container,
    );
    button.type = "button";
    button.title = "Choose basemap and reference overlays";
    button.setAttribute("aria-label", "Choose basemap and reference overlays");
    button.setAttribute("aria-expanded", "false");

    const panel = L.DomUtil.create("div", "map-layer-panel", container);
    panel.id = "map-layer-panel";
    panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "Basemaps and reference overlays");
    const heading = L.DomUtil.create("strong", "map-layer-heading", panel);
    heading.textContent = "Map style";
    layerStatus = L.DomUtil.create("span", "map-layer-status", panel);
    layerStatus.setAttribute("role", "status");

    const options = [
      ["esri", "Esri World Street Map"],
      ["esri-imagery", "Esri World Imagery"],
      ["esri-hillshade", "Esri World Hillshade"],
      ["usgs-topo", "USGS Topographic Map"],
      ["osm:standard", "OpenStreetMap · Standard"],
      ["osm:hot", "OpenStreetMap · Humanitarian"],
      ["osm:topographic", "OpenTopoMap · Topographic"],
    ];
    if (settings.basemapUrl) {
      options.push(["custom", "Custom XYZ tiles"]);
    }

    options.forEach(([value, label], index) => {
      const optionLabel = L.DomUtil.create("label", "map-layer-option", panel);
      const radio = L.DomUtil.create("input", "", optionLabel);
      radio.type = "radio";
      radio.name = "map-style-choice";
      radio.value = value;
      radio.checked = value === activeBasemapOption();
      radio.id = `map-style-choice-${index}`;
      const text = L.DomUtil.create("span", "", optionLabel);
      text.textContent = label;
      radio.addEventListener("change", () => {
        if (!radio.checked) {
          return;
        }
        applyBasemapOption(radio.value);
        button.setAttribute("aria-expanded", "false");
        panel.hidden = true;
      });
    });

    const separator = L.DomUtil.create("hr", "map-layer-separator", panel);
    separator.setAttribute("aria-hidden", "true");
    const overlayHeading = L.DomUtil.create("strong", "map-layer-heading", panel);
    overlayHeading.textContent = "Reference overlays";
    const overlayHelp = L.DomUtil.create("p", "map-layer-help", panel);
    overlayHelp.textContent =
      "Enable a road overlay, then click a mapped route for details. These layers do not confirm current access or camping permission.";

    const overlayDefinitions = {
      fsRecreation: {
        label: "USFS recreation sites",
        description: "Nightly-updated mapped facilities",
        legendTitle: "Recreation symbols",
        legendDescription: "Mapped recreation opportunity categories; not all sites are campgrounds.",
        url: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer",
        layers: [0],
        attribution: '<a href="https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer">USDA Forest Service Recreation Opportunities</a>',
      },
      fsRoads: {
        isRoad: true,
        label: "USFS roads",
        description: "Mapped Forest Service roads; verify current conditions",
        legendTitle: "Road symbols",
        legendDescription: "Mapped road surface categories; not current access status.",
        url: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer",
        layers: [0],
        attribution: '<a href="https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer">USDA Forest Service National Forest System Roads</a>',
      },
      fsClosedRoads: {
        isRoad: true,
        label: "USFS roads mapped closed to motorized use",
        description: "Not a live closure or access feed",
        legendTitle: "Mapped closure symbol",
        legendDescription: "A mapped motorized-use designation, not a live closure feed.",
        legendFallback: "Road mapped closed to motorized uses",
        url: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer",
        layers: [1],
        attribution: '<a href="https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer">USDA Forest Service National Forest System Roads</a>',
      },
      fsTrails: {
        label: "USFS trails",
        description: "Trail attributes vary by forest",
        legendTitle: "Trail symbol",
        legendDescription: "Forest Service trail mapping; detail and attributes vary by forest.",
        legendFallback: "National Forest System trail",
        url: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer",
        layers: [0],
        attribution: '<a href="https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer">USDA Forest Service National Forest System Trails</a>',
      },
      fsMvum: {
        isRoad: true,
        label: "USFS MVUM routes",
        description: "Designated motor-vehicle routes; coverage varies by forest",
        legendTitle: "MVUM route markings",
        legendDescription:
          "Vehicle permissions and seasons are not camping permission or current closure status.",
        url: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer",
        layers: [1, 2],
        attribution: '<a href="https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer">USDA Forest Service Motor Vehicle Use Map</a>',
      },
      blmPublicRoads: {
        isRoad: true,
        type: "feature",
        label: "BLM public-release motorized roads",
        description: "National GTLF subset; not proof of public access",
        legendTitle: "BLM GTLF road marking",
        legendDescription:
          "Solid green identifies this source dataset subset, not legal public access or current road status.",
        url: "https://services1.arcgis.com/KbxwQRRfWyEYLgp4/arcgis/rest/services/BLM_Natl_GTLF_Public_Motorized_Roads/FeatureServer/3",
        where: "ADMIN_ST = 'CA'",
        color: "#397b46",
        dashArray: null,
        attribution: '<a href="https://www.arcgis.com/home/item.html?id=f94999eb674d4085be0c86729fe4a151">BLM National Ground Transportation Linear Features (GTLF)</a>',
      },
      blmLimitedRoads: {
        isRoad: true,
        type: "feature",
        label: "BLM limited-public motorized roads",
        description: "National GTLF subset; not a live access status",
        legendTitle: "BLM GTLF road marking",
        legendDescription:
          "Dashed rust identifies this source dataset subset, not legal access or current road status.",
        url: "https://services1.arcgis.com/KbxwQRRfWyEYLgp4/arcgis/rest/services/BLM_Natl_GTLF_Limited_Public_Motorized_Roads/FeatureServer/0",
        where: "ADMIN_ST = 'CA'",
        color: "#a45138",
        dashArray: "6 4",
        attribution: '<a href="https://www.arcgis.com/home/item.html?id=4a2d788c46804bfbb7288d05184e2936">BLM National Ground Transportation Linear Features (GTLF)</a>',
      },
    };
    const overlayLayers = {};
    const legendRequests = new Map();

    Object.entries(overlayDefinitions).forEach(([key, definition]) => {
      const overlayEntry = L.DomUtil.create("div", "map-overlay-entry", panel);
      const optionLabel = L.DomUtil.create(
        "label",
        "map-layer-option map-overlay-option",
        overlayEntry,
      );
      const checkbox = L.DomUtil.create("input", "", optionLabel);
      checkbox.type = "checkbox";
      checkbox.name = "map-reference-overlay";
      checkbox.value = key;
      checkbox.checked = Boolean(settings.overlays[key]);
      const copy = L.DomUtil.create("span", "map-overlay-copy", optionLabel);
      const labelText = L.DomUtil.create("strong", "", copy);
      labelText.textContent = definition.label;
      const description = L.DomUtil.create("small", "", copy);
      description.textContent = definition.description;
      const legend = L.DomUtil.create("section", "map-overlay-legend", overlayEntry);
      legend.hidden = true;
      const legendHeading = L.DomUtil.create("strong", "map-overlay-legend-heading", legend);
      legendHeading.textContent = definition.legendTitle;
      const legendDescription = L.DomUtil.create("p", "map-layer-help", legend);
      legendDescription.textContent = definition.legendDescription;
      const legendContent = L.DomUtil.create("div", "map-overlay-legend-content", legend);
      let legendLoaded = false;

      async function loadOverlayLegend() {
        if (legendLoaded) {
          return;
        }
        if (definition.type === "feature") {
          const item = L.DomUtil.create("div", "map-mvum-legend-item", legendContent);
          const line = L.DomUtil.create("span", "map-blm-legend-line", item);
          line.classList.add(key === "blmLimitedRoads" ? "is-limited" : "is-public");
          const label = L.DomUtil.create("span", "", item);
          label.textContent = definition.label;
          legendLoaded = true;
          return;
        }

        const legendUrl = `${definition.url}/legend?f=json`;
        if (!legendRequests.has(legendUrl)) {
          legendRequests.set(
            legendUrl,
            fetch(legendUrl).then((response) => {
              if (!response.ok) {
                throw new Error(`Legend request failed (${response.status}).`);
              }
              return response.json();
            }),
          );
        }
        try {
          const data = await legendRequests.get(legendUrl);
          const serviceLayers = (data.layers ?? []).filter((layer) =>
            definition.layers.includes(layer.layerId),
          );
          if (serviceLayers.length !== definition.layers.length) {
            throw new Error("The service returned an incomplete legend.");
          }
          serviceLayers.forEach((serviceLayer) => {
            const group = L.DomUtil.create("div", "map-mvum-legend-group", legendContent);
            if (serviceLayers.length > 1) {
              const groupHeading = L.DomUtil.create(
                "strong",
                "map-mvum-legend-group-title",
                group,
              );
              groupHeading.textContent = serviceLayer.layerName.endsWith("Roads")
                ? "Roads"
                : "Trails";
            }
            const list = L.DomUtil.create("ul", "map-mvum-legend-list", group);
            (serviceLayer.legend ?? []).forEach((entry) => {
              if (
                entry.contentType !== "image/png" ||
                typeof entry.imageData !== "string" ||
                !/^[A-Za-z0-9+/=]+$/.test(entry.imageData)
              ) {
                return;
              }
              const item = L.DomUtil.create("li", "map-mvum-legend-item", list);
              const symbol = L.DomUtil.create("img", "map-mvum-legend-symbol", item);
              symbol.src = `data:image/png;base64,${entry.imageData}`;
              symbol.alt = "";
              const label = L.DomUtil.create("span", "", item);
              label.textContent =
                entry.label || definition.legendFallback || serviceLayer.layerName;
            });
          });
          if (!legendContent.childElementCount) {
            throw new Error("The service legend contained no usable symbols.");
          }
          legendLoaded = true;
        } catch (error) {
          legendRequests.delete(legendUrl);
          console.error(`Could not load the ${definition.label} legend.`, error);
          layerStatus.textContent = `${definition.label} is on, but its legend could not be loaded.`;
        }
      }

      checkbox.addEventListener("change", () => {
        settings.overlays[key] = checkbox.checked;
        if (definition.isRoad) {
          if (checkbox.checked) {
            activeRoadOverlays.set(key, { ...definition, key });
          } else {
            activeRoadOverlays.delete(key);
          }
        }
        layerStatus.textContent = "";
        legend.hidden = !checkbox.checked;
        if (checkbox.checked) {
          loadOverlayLegend();
        }
        try {
          window.CampgroundlessSettings.write(settings);
        } catch (error) {
          console.error("Could not save reference overlay preference.", error);
          layerStatus.textContent =
            "Overlay changed for this visit, but could not be saved in this browser.";
        }

        if (checkbox.checked) {
          if (!overlayLayers[key]) {
            const overlay =
              definition.type === "feature"
                ? L.esri.featureLayer({
                    url: definition.url,
                    where: definition.where,
                    pane: "referenceOverlays",
                    attribution: definition.attribution,
                    style: () => ({
                      color: definition.color,
                      weight: 2,
                      opacity: 0.9,
                      dashArray: definition.dashArray,
                    }),
                  })
                : L.esri.dynamicMapLayer({
                    url: definition.url,
                    layers: definition.layers,
                    opacity: 0.88,
                    pane: "referenceOverlays",
                    attribution: definition.attribution,
                  });
            overlay.on("requesterror", () => {
              layerStatus.textContent = `${definition.label} could not be loaded. The provider may be unavailable.`;
            });
            if (definition.isRoad) {
              overlay.on("click", (event) => {
                if (event.originalEvent) {
                  L.DomEvent.stopPropagation(event.originalEvent);
                }
                handleMapClick(event);
              });
            }
            overlayLayers[key] = overlay;
          }
          overlayLayers[key].addTo(map);
        } else if (overlayLayers[key]) {
          map.removeLayer(overlayLayers[key]);
        }
      });
      if (checkbox.checked) {
        checkbox.dispatchEvent(new Event("change"));
      }
    });

    button.setAttribute("aria-controls", panel.id);
    button.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) {
        panel.querySelector('input[type="radio"]:checked')?.focus();
      }
    });
    container.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.focus();
      }
    });
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    return container;
  };
  L.control.zoom({ position: "bottomright" }).addTo(map);
  layerControl.addTo(map);

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

  function setNoteMessage(text, isError = false) {
    noteMessage.textContent = text;
    noteMessage.classList.toggle("is-error", isError);
  }

  function validNote(note) {
    return (
      note &&
      typeof note.id === "string" &&
      typeof note.title === "string" &&
      typeof note.body === "string" &&
      typeof note.createdAt === "string" &&
      typeof note.updatedAt === "string" &&
      Object.hasOwn(noteTypes, note.icon) &&
      Number.isFinite(note.lat) &&
      Number.isFinite(note.lng) &&
      californiaBounds.contains([note.lat, note.lng])
    );
  }

  try {
    const savedNotes = JSON.parse(localStorage.getItem(notesStorageKey) || "[]");
    notes = Array.isArray(savedNotes) ? savedNotes.filter(validNote) : [];
  } catch (error) {
    console.error("Could not read saved map notes.", error);
    setNoteMessage("Saved notes could not be loaded from this browser.", true);
  }

  function persistNotes(nextNotes) {
    localStorage.setItem(notesStorageKey, JSON.stringify(nextNotes));
  }

  function encodeSharedNote(note) {
    const bytes = new TextEncoder().encode(JSON.stringify(note));
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }

  function decodeSharedNote(token) {
    if (!token || token.length > 5000) {
      return null;
    }
    try {
      const base64 = token.replaceAll("-", "+").replaceAll("_", "/");
      const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const note = JSON.parse(new TextDecoder().decode(bytes));
      return validNote(note) && note.title.length <= 80 && note.body.length <= 1200
        ? note
        : null;
    } catch (error) {
      console.warn("Could not read the shared map note from this link.", error);
      return null;
    }
  }

  function shareUrlForNote(note) {
    const url = new URL(window.location.href);
    url.hash = `shared-note=${encodeSharedNote(note)}`;
    return url.href;
  }

  async function shareNote(note) {
    const shareUrl = shareUrlForNote(note);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is not available.");
      }
      await navigator.clipboard.writeText(shareUrl);
      setNoteMessage("Share link copied. Anyone with it can view this note.", false);
    } catch (error) {
      console.warn("Could not copy the shared map note link.", error);
      const copied = window.prompt("Copy this view-only share link:", shareUrl);
      setNoteMessage(
        copied === null
          ? "Share link was not copied."
          : "Share link is ready to paste. Anyone with it can view this note.",
        copied === null,
      );
    }
  }

  function readSharedNoteFromUrl() {
    const match = window.location.hash.match(/^#shared-note=(.+)$/);
    if (!match) {
      return null;
    }
    const note = decodeSharedNote(match[1]);
    if (!note) {
      setNoteMessage("This shared-note link is invalid or incomplete.", true);
      return null;
    }
    return note;
  }

  function closeNoteEditor() {
    noteForm.hidden = true;
    editingNoteId = null;
    selectedNoteLocation = null;
    noteForm.reset();
    noteIcon.value = "camp";
    setNoteMessage("");
  }

  function openNoteEditor(location, note = null) {
    if (!californiaBounds.contains(location)) {
      selectedNoteLocation = null;
      setNoteMessage("Choose a point within California to save a note.", true);
      return;
    }
    selectedNoteLocation = location;
    editingNoteId = note?.id ?? null;
    noteForm.hidden = false;
    noteLocation.textContent = `Selected location: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
    noteTitle.value = note?.title ?? "";
    noteIcon.value = note?.icon ?? "camp";
    noteBody.value = note?.body ?? "";
    noteForm.querySelector(".note-save-button").textContent = note ? "Update note" : "Save note";
    setNoteMessage("");
    if (window.matchMedia("(max-width: 700px)").matches) {
      noteForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      noteTitle.focus({ preventScroll: true });
    }
  }

  function buildNotePopup(note, shared = false) {
    const type = noteTypes[note.icon];
    const title = note.title.trim() || type.label;
    const timestamp = new Date(note.updatedAt);
    const dateText = Number.isNaN(timestamp.getTime()) ? "" : timestamp.toLocaleDateString();
    return `
      <div class="map-note-popup">
        <div class="map-note-popup-type">${type.icon} ${escapeHtml(type.label)}${dateText ? ` · ${escapeHtml(dateText)}` : ""}${shared ? " · Shared view" : ""}</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(note.body)}</p>
        ${shared ? "" : `<div class="map-note-popup-actions">
          <button type="button" data-note-action="share" data-note-id="${escapeHtml(note.id)}">Copy share link</button>
          <button type="button" data-note-action="edit" data-note-id="${escapeHtml(note.id)}">Edit</button>
          <button type="button" data-note-action="delete" data-note-id="${escapeHtml(note.id)}">Delete</button>
        </div>`}
      </div>`;
  }

  const sharedNote = readSharedNoteFromUrl();

  function renderNotes() {
    noteMarkers.clearLayers();
    notes.forEach((note) => {
      if (sharedNote?.id === note.id) {
        return;
      }
      const type = noteTypes[note.icon];
      const marker = L.marker([note.lat, note.lng], {
        icon: L.divIcon({
          className: "map-note-icon",
          html: `<span><i>${type.icon}</i></span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 30],
          popupAnchor: [0, -28],
        }),
        title: `${type.label}: ${note.title || note.body.slice(0, 60)}`,
        alt: `${type.label} map note`,
      }).addTo(noteMarkers);
      marker.bindPopup(buildNotePopup(note), { maxWidth: 280 });
      marker.on("popupopen", (event) => {
        event.popup.getElement().querySelectorAll("[data-note-action]").forEach((button) => {
          button.addEventListener("click", () => {
            const selectedNote = notes.find((entry) => entry.id === button.dataset.noteId);
            if (!selectedNote) {
              return;
            }
            if (button.dataset.noteAction === "share") {
              void shareNote(selectedNote);
              return;
            }
            if (button.dataset.noteAction === "edit") {
              openNoteEditor(L.latLng(selectedNote.lat, selectedNote.lng), selectedNote);
              map.closePopup();
              return;
            }
            if (window.confirm("Delete this map note?")) {
              const nextNotes = notes.filter((entry) => entry.id !== selectedNote.id);
              try {
                persistNotes(nextNotes);
                notes = nextNotes;
                map.closePopup();
                renderNotes();
                setNoteMessage("Map note deleted from this browser.");
              } catch (error) {
                console.error("Could not delete map note.", error);
                setNoteMessage("Could not delete the note. Check this browser's storage settings.", true);
              }
            }
          });
        });
      });
    });
    noteCount.textContent = `${notes.length} saved`;
  }

  map.on("click", handleMapClick);
  document.getElementById("map-note-cancel").addEventListener("click", closeNoteEditor);
  noteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = noteBody.value.trim();
    const title = noteTitle.value.trim();
    if (!selectedNoteLocation || !body) {
      setNoteMessage("Select a map location and enter a note or review.", true);
      return;
    }
    const existingNote = notes.find((note) => note.id === editingNoteId);
    const now = new Date().toISOString();
    const note = {
      id: existingNote?.id ?? (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      lat: selectedNoteLocation.lat,
      lng: selectedNoteLocation.lng,
      title,
      icon: noteIcon.value,
      body,
      createdAt: existingNote?.createdAt ?? now,
      updatedAt: now,
    };
    const nextNotes = existingNote
      ? notes.map((entry) => (entry.id === existingNote.id ? note : entry))
      : [...notes, note];
    try {
      persistNotes(nextNotes);
      notes = nextNotes;
      renderNotes();
      closeNoteEditor();
      setNoteMessage("Map note saved in this browser.");
    } catch (error) {
      console.error("Could not save map note.", error);
      setNoteMessage("Could not save the note. Check this browser's storage settings.", true);
    }
  });
  renderNotes();

  if (sharedNote) {
    sharedNoteNotice.hidden = false;
    const marker = L.marker([sharedNote.lat, sharedNote.lng], {
      icon: L.divIcon({
        className: "map-note-icon",
        html: `<span><i>${noteTypes[sharedNote.icon].icon}</i></span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 30],
        popupAnchor: [0, -28],
      }),
      title: `${noteTypes[sharedNote.icon].label}: ${sharedNote.title || sharedNote.body.slice(0, 60)}`,
      alt: `Shared ${noteTypes[sharedNote.icon].label} map note`,
    }).addTo(sharedNoteMarkers);
    marker.bindPopup(buildNotePopup(sharedNote, true), { maxWidth: 280 });
    map.setView([sharedNote.lat, sharedNote.lng], 15);
    marker.openPopup();
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
        <div class="feature-note-action">
          <label for="feature-note-icon">Add a personal note at this point</label>
          <select id="feature-note-icon" class="feature-note-icon-select" aria-label="Choose a note icon">${noteIconOptions}</select>
          <button type="button" class="feature-note-button">Write note here</button>
        </div>
      </div>`;
    layer.bindPopup(popup, { maxWidth: 260 });
    layer.on("popupopen", (event) => {
      const popupElement = event.popup.getElement();
      const iconSelect = popupElement.querySelector(".feature-note-icon-select");
      popupElement.querySelector(".feature-note-button").addEventListener("click", () => {
        openNoteEditor(event.popup.getLatLng());
        if (!noteForm.hidden) {
          noteIcon.value = iconSelect.value;
          map.closePopup();
        }
      });
    });
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
  landLayer.on("click", (event) => {
    if (activeRoadOverlays.size === 0) {
      return;
    }
    if (event.originalEvent) {
      L.DomEvent.stopPropagation(event.originalEvent);
    }
    handleMapClick(event, true);
  });

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

  const censusRoadService =
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer";
  const nearbyRoadSearchMeters = 10000;
  let roadLookupSequence = 0;

  async function queryArcGisFeatures(layerUrl, {
    where = "1=1",
    geometry,
    geometryType,
    outFields = "*",
    token,
    resultRecordCount = 2000,
  }) {
    const url = `${layerUrl.replace(/\/+$/, "")}/query`;
    const parameters = new URLSearchParams({
      where,
      geometry: JSON.stringify(geometry),
      geometryType,
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields,
      returnGeometry: "true",
      resultRecordCount: String(resultRecordCount),
      f: "geojson",
    });
    if (token) {
      parameters.set("token", token);
    }
    const response = await fetch(`${url}?${parameters}`);
    if (!response.ok) {
      throw new Error(`Map data request failed (${response.status}).`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "Map data provider returned an error.");
    }
    return data;
  }

  function roadQueryEnvelope(location, radius) {
    const latitudePadding = radius / 111320;
    const longitudePadding = latitudePadding / Math.max(0.01, Math.cos((location.lat * Math.PI) / 180));
    return {
      xmin: location.lng - longitudePadding,
      ymin: location.lat - latitudePadding,
      xmax: location.lng + longitudePadding,
      ymax: location.lat + latitudePadding,
      spatialReference: { wkid: 4326 },
    };
  }

  function propertyValue(properties, ...names) {
    const entries = Object.entries(properties ?? {});
    for (const name of names) {
      const entry = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
      if (entry && entry[1] !== null && entry[1] !== undefined && String(entry[1]).trim()) {
        return entry[1];
      }
    }
    return "";
  }

  function roadClickToleranceMeters(location) {
    const point = map.latLngToContainerPoint(location);
    const adjacentPoint = map.containerPointToLatLng(L.point(point.x + 12, point.y));
    return Math.max(35, Math.min(400, map.distance(location, adjacentPoint)));
  }

  async function queryRoadOverlay(definition, location, toleranceMeters) {
    const nearbyGeometry = roadQueryEnvelope(location, toleranceMeters);
    const layerSources =
      definition.type === "feature"
        ? [{ url: definition.url, layerId: null }]
        : definition.layers.map((layerId) => ({
            url: `${definition.url}/${layerId}`,
            layerId,
          }));
    const results = await Promise.all(
      layerSources.map(async ({ url, layerId }) => {
        const data = await queryArcGisFeatures(url, {
          where: definition.where ?? "1=1",
          geometry: nearbyGeometry,
          geometryType: "esriGeometryEnvelope",
        });
        return (data.features ?? []).map((feature) => ({
          definition,
          layerId,
          properties: feature.properties ?? {},
          geometry: feature.geometry,
        }));
      }),
    );
    return results.flat();
  }

  async function queryLandAtPoint(location) {
    const data = await queryArcGisFeatures(dataSourceUrl, {
      where: buildWhere({ forest: true, blm: true, state: true, other: true }),
      geometry: {
        x: location.lng,
        y: location.lat,
        spatialReference: { wkid: 4326 },
      },
      geometryType: "esriGeometryPoint",
      outFields: "FeatClass,Mang_Name,Unit_Nm,Loc_Nm,Pub_Access,Src_Date",
      token: settings.dataApiKey,
      resultRecordCount: 10,
    });
    return data.features?.[0]?.properties ?? null;
  }

  function pointToRoadDistanceMeters(location, geometry) {
    const coordinates = geometry?.type === "LineString"
      ? [geometry.coordinates]
      : geometry?.type === "MultiLineString"
        ? geometry.coordinates
        : [];
    const earthRadius = 6371008.8;
    const latitudeRadians = (location.lat * Math.PI) / 180;
    const metersPerDegreeLatitude = (Math.PI * earthRadius) / 180;
    const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos(latitudeRadians);
    let shortestDistance = Infinity;

    coordinates.forEach((line) => {
      for (let index = 1; index < line.length; index += 1) {
        const first = line[index - 1];
        const second = line[index];
        const ax = (first[0] - location.lng) * metersPerDegreeLongitude;
        const ay = (first[1] - location.lat) * metersPerDegreeLatitude;
        const bx = (second[0] - location.lng) * metersPerDegreeLongitude;
        const by = (second[1] - location.lat) * metersPerDegreeLatitude;
        const segmentX = bx - ax;
        const segmentY = by - ay;
        const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
        const projection =
          segmentLengthSquared === 0
            ? 0
            : Math.max(
                0,
                Math.min(1, -(ax * segmentX + ay * segmentY) / segmentLengthSquared),
              );
        shortestDistance = Math.min(
          shortestDistance,
          Math.hypot(ax + projection * segmentX, ay + projection * segmentY),
        );
      }
    });
    return shortestDistance;
  }

  function censusRoadType(properties) {
    const mtfcc = propertyValue(properties, "MTFCC");
    const routeType = propertyValue(properties, "RTTYP");
    const routeTypes = {
      I: "Interstate",
      U: "U.S. Highway",
      S: "State highway",
      C: "County road",
    };
    if (routeTypes[routeType]) {
      return routeTypes[routeType];
    }
    return (
      {
        S1100: "Primary highway",
        S1200: "Secondary road (U.S./state highway or connector)",
        S1400: "Local road (neighborhood/rural street)",
      }[mtfcc] || "Public road"
    );
  }

  async function findNearestNamedRoad(location) {
    const dataByLayer = await Promise.all(
      [2, 6, 8].map((layerId) =>
        queryArcGisFeatures(`${censusRoadService}/${layerId}`, {
          where: "NAME IS NOT NULL AND NAME <> '' AND MTFCC IN ('S1100','S1200','S1400')",
          geometry: roadQueryEnvelope(location, nearbyRoadSearchMeters),
          geometryType: "esriGeometryEnvelope",
          outFields: "NAME,BASENAME,MTFCC,RTTYP",
          resultRecordCount: 2000,
        }),
      ),
    );
    let nearest = null;
    let incomplete = false;
    dataByLayer.forEach((data) => {
      incomplete ||= data.exceededTransferLimit === true;
      (data.features ?? []).forEach((feature) => {
        const name = propertyValue(feature.properties, "NAME", "BASENAME");
        if (!name) {
          return;
        }
        const distance = pointToRoadDistanceMeters(location, feature.geometry);
        if (
          Number.isFinite(distance) &&
          distance <= nearbyRoadSearchMeters &&
          (!nearest || distance < nearest.distance)
        ) {
          nearest = {
            name,
            type: censusRoadType(feature.properties),
            distance,
          };
        }
      });
    });
    return { road: nearest, incomplete };
  }

  function roadRestrictionDetails(road) {
    const properties = road.properties;
    const key = road.definition.key;
    let fields;
    if (key.startsWith("blm")) {
      fields = [
        ["Planned travel mode", ["PLAN_ALLOW_MODE_TRNSPRT"]],
        ["Access restriction", ["PLAN_ACCESS_RSTRCT"]],
        ["Seasonal restriction", ["PLAN_SEASON_RSTRCT_CODE"]],
        ["OHV designation", ["PLAN_OHV_ROUTE_DSGNTN"]],
        ["OHV limits", ["OHV_ROUTE_DSGNTN_LIM", "OHV_DSGNTN_LIM_EXPLAIN"]],
      ];
    } else if (key === "fsMvum") {
      fields = [
        ["MVUM route designation", ["mvum_symbol_name"]],
        ["Seasonal designation", ["seasonal"]],
      ];
      [
        ["Passenger vehicles", "passengervehicle", "passengervehicle_datesopen"],
        ["High-clearance vehicles", "highclearancevehicle", "highclearancevehicle_datesopen"],
        ["Trucks", "truck", "truck_datesopen"],
        ["Buses", "bus", "bus_datesopen"],
        ["Motorhomes", "motorhome", "motorhome_datesopen"],
        ["Four-wheel drive over 50 inches", "fourwd_gt50inches", "fourwd_gt50_datesopen"],
        ["Two-wheel drive over 50 inches", "twowd_gt50inches", "twowd_gt50_datesopen"],
        ["Tracked OHV over 50 inches", "tracked_ohv_gt50inches", "tracked_ohv_gt50_datesopen"],
        ["Other OHV over 50 inches", "other_ohv_gt50inches", "other_ohv_gt50_datesopen"],
        ["ATVs", "atv", "atv_datesopen"],
        ["Motorcycles", "motorcycle", "motorcycle_datesopen"],
        ["Other wheeled OHVs", "otherwheeled_ohv", "otherwheeled_ohv_datesopen"],
        ["Tracked OHV under 50 inches", "tracked_ohv_lt50inches", "tracked_ohv_lt50_datesopen"],
        ["Other OHV under 50 inches", "other_ohv_lt50inches", "other_ohv_lt50_datesopen"],
      ].forEach(([label, property, datesProperty]) => {
        const value = propertyValue(properties, property);
        const dates = propertyValue(properties, datesProperty);
        if ((value && !/^(no|n|false)$/i.test(value)) || dates) {
          fields.push([
            label,
            [value, dates ? `Dates open: ${dates}` : ""].filter(Boolean).join(" · "),
          ]);
        }
      });
    } else {
      fields = [
        ["Mapped route status", ["route_status"]],
        ["Mapped motorized-use status", ["openforuseto"]],
        ["Surface", ["surface_type"]],
        ["Maintenance level", ["oper_maint_level"]],
      ];
      if (key === "fsClosedRoads") {
        fields.unshift(["Mapped designation", []]);
      }
    }
    const details = [];
    fields.forEach(([label, names]) => {
      const value =
        label === "Mapped designation" && key === "fsClosedRoads"
          ? "Mapped closed to motorized uses; not a real-time closure feed"
          : Array.isArray(names)
            ? propertyValue(properties, ...names)
            : names;
      if (value) {
        details.push([label, value]);
      }
    });
    return details;
  }

  function landTypeDescription(properties) {
    if (!properties) {
      return "No matching land record at this point; this does not prove the land is private.";
    }
    const manager = managerNames[propertyValue(properties, "Mang_Name")] ||
      propertyValue(properties, "Mang_Name") ||
      "Public land manager not specified";
    const category = propertyValue(properties, "FeatClass");
    const unit =
      propertyValue(properties, "Unit_Nm", "Loc_Nm") || "Unnamed land unit";
    const access = propertyValue(properties, "Pub_Access");
    return `${manager} · ${unit}${category ? ` · ownership class: ${category}` : ""}${
      access ? ` · PAD-US access code: ${access}` : ""
    }`;
  }

  function distanceDescription(distance) {
    if (distance < 160.9344) {
      return `about ${Math.round(distance * 3.28084)} ft`;
    }
    return `about ${(distance / 1609.344).toFixed(2)} mi`;
  }

  function formatRoadPopup(road, land, nearestRoad, location, landError, nearbyRoadError) {
    const properties = road.properties;
    const name =
      propertyValue(properties, "name", "ROUTE_PRMRY_NM") || "Unnamed mapped route";
    const roadType =
      road.definition.key === "fsMvum"
        ? `${road.layerId === 1 ? "Forest Service MVUM road" : "Forest Service MVUM motorized trail"}`
        : road.definition.key === "fsClosedRoads"
          ? "Forest Service road (mapped motorized-use closure designation)"
          : road.definition.key.startsWith("blm")
            ? propertyValue(properties, "PLAN_ASSET_CLASS") || "BLM GTLF motorized road"
            : "National Forest System road";
    const restrictions = roadRestrictionDetails(road);
    const restrictionMarkup = restrictions.length
      ? `<ul>${restrictions
          .map(
            ([label, value]) =>
              `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`,
          )
          .join("")}</ul>`
      : "<p>No restriction details are available in this road record.</p>";
    const landMarkup = landError
      ? "Land type could not be looked up. Verify with the land manager."
      : landTypeDescription(land);
    let nearestMarkup;
    if (nearbyRoadError) {
      nearestMarkup = "Named-road distance could not be looked up.";
    } else if (nearestRoad?.road) {
      nearestMarkup = `${escapeHtml(nearestRoad.road.name)} · ${escapeHtml(
        nearestRoad.road.type,
      )} · ${distanceDescription(nearestRoad.road.distance)} straight-line`;
      if (nearestRoad.incomplete) {
        nearestMarkup += " (nearby road results may be incomplete)";
      }
    } else {
      nearestMarkup = "No named public road found within 6.2 mi.";
    }
    return `
      <div class="map-popup road-location-popup">
        <div class="map-popup-label">${escapeHtml(road.definition.label)}</div>
        <h3>${escapeHtml(name)}</h3>
        <p><strong>Land:</strong> ${escapeHtml(landMarkup)}</p>
        <p><strong>Road type:</strong> ${escapeHtml(roadType)}</p>
        <div class="road-restrictions"><strong>Restrictions and status</strong>${restrictionMarkup}</div>
        <p><strong>Coordinates (lat, lon):</strong> ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}</p>
        <p><strong>Nearest named public road:</strong> ${nearestMarkup}</p>
        <p class="popup-warning">Reference data only. Road records may be incomplete or outdated and do not establish current access or camping permission. Confirm route restrictions, closures, and land rules with the responsible agency.</p>
        <div class="feature-note-action"><button type="button" class="road-note-button">Write a note here</button></div>
      </div>`;
  }

  async function handleMapClick(event, fromLandFeature = false) {
    if (activeRoadOverlays.size === 0) {
      openNoteEditor(event.latlng);
      return;
    }
    layerStatus.textContent = "";
    const lookupId = ++roadLookupSequence;
    const location = event.latlng;
    const toleranceMeters = roadClickToleranceMeters(location);
    const activeOverlays = [...activeRoadOverlays.values()];
    const roadResults = await Promise.allSettled(
      activeOverlays.map((definition) =>
        queryRoadOverlay(definition, location, toleranceMeters),
      ),
    );
    if (lookupId !== roadLookupSequence) {
      return;
    }
    const nearbyRoads = roadResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    const closestRoad = nearbyRoads
      .map((road) => ({
        ...road,
        distance: pointToRoadDistanceMeters(location, road.geometry),
      }))
      .filter(
        (road) =>
          Number.isFinite(road.distance) && road.distance <= toleranceMeters,
      )
      .sort((first, second) => first.distance - second.distance)[0];
    if (!closestRoad) {
      const failedSources = roadResults
        .map((result, index) => (result.status === "rejected" ? activeOverlays[index].label : null))
        .filter(Boolean);
      if (failedSources.length) {
        layerStatus.textContent = fromLandFeature
          ? `Could not check ${failedSources.join(", ")}; showing the land information.`
          : `Could not check ${failedSources.join(", ")}; no selected road was identified at this point.`;
      } else {
        layerStatus.textContent = fromLandFeature
          ? "No selected road was found here. Showing the land information."
          : `No selected road was found within ${distanceDescription(toleranceMeters)}. Zoom in and click closer to a mapped route.`;
      }
      if (!fromLandFeature && !event.originalEvent?.target?.closest?.(".leaflet-interactive")) {
        openNoteEditor(location);
      }
      return;
    }

    map.closePopup();
    noteForm.hidden = true;
    const popup = L.popup({ maxWidth: 340, maxHeight: 360 })
      .setLatLng(location)
      .setContent(
        `<div class="map-popup"><p>Loading road, land, and nearby named-road details…</p></div>`,
      )
      .openOn(map);
    map.attributionControl.addAttribution(
      '<a href="https://tigerweb.geo.census.gov/">U.S. Census Bureau TIGERweb Roads</a>',
    );
    const [landResult, nearbyRoadResult] = await Promise.allSettled([
      queryLandAtPoint(location),
      findNearestNamedRoad(location),
    ]);
    if (lookupId !== roadLookupSequence) {
      return;
    }
    const landError = landResult.status === "rejected";
    const nearbyRoadError = nearbyRoadResult.status === "rejected";
    if (landError) {
      console.error("Could not identify land at the selected road location.", landResult.reason);
    }
    if (nearbyRoadError) {
      console.error("Could not find a nearby named public road.", nearbyRoadResult.reason);
    }
    popup.setContent(
      formatRoadPopup(
        closestRoad,
        landError ? null : landResult.value,
        nearbyRoadError ? null : nearbyRoadResult.value,
        location,
        landError,
        nearbyRoadError,
      ),
    );
    popup.getElement()?.querySelector(".road-note-button")?.addEventListener("click", () => {
      openNoteEditor(location);
      map.closePopup();
    });
  }

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

  function clearSearchResults() {
    searchResults.replaceChildren();
    searchResults.hidden = true;
    searchMarkers.clearLayers();
  }

  function showPlace(place) {
    const latitude = Number(place.lat);
    const longitude = Number(place.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    const location = L.latLng(latitude, longitude);
    if (!californiaBounds.contains(location)) {
      return;
    }
    searchMarkers.clearLayers();
    const marker = L.marker(location)
      .addTo(searchMarkers)
      .bindPopup(`<div class="map-popup"><h3>${escapeHtml(place.display_name)}</h3><p>Place search result from OpenStreetMap.</p></div>`);
    map.setView(location, 14);
    marker.openPopup();
    searchMessage.textContent = `Showing ${place.display_name}.`;
  }

  function displayPlaceResults(places) {
    searchResults.replaceChildren();
    const validPlaces = places.filter((place) => {
      const latitude = Number(place.lat);
      const longitude = Number(place.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || typeof place.display_name !== "string") {
        return false;
      }
      const location = L.latLng(latitude, longitude);
      return (
        californiaBounds.contains(location) &&
        location.lat >= -90 &&
        location.lat <= 90 &&
        location.lng >= -180 &&
        location.lng <= 180
      );
    });
    validPlaces.forEach((place) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.textContent = place.display_name;
      button.addEventListener("click", () => showPlace(place));
      item.append(button);
      searchResults.append(item);
    });
    searchResults.hidden = validPlaces.length === 0;
    if (validPlaces.length === 0) {
      searchMessage.textContent = "No matching California places found. Try another name or spelling.";
      return;
    }
    searchMessage.textContent = `${validPlaces.length} place results found. Choose one to show it on the map.`;
  }

  async function searchPlaces(term) {
    const normalizedTerm = term.toLocaleLowerCase();
    if (placeSearchCache.has(normalizedTerm)) {
      displayPlaceResults(placeSearchCache.get(normalizedTerm));
      return;
    }
    const waitTime = Math.max(0, 1000 - (Date.now() - lastPlaceSearchAt));
    if (waitTime > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, waitTime));
    }
    const endpoint = new URL(settings.placeSearchUrl);
    endpoint.searchParams.set("q", term);
    endpoint.searchParams.set("format", "jsonv2");
    endpoint.searchParams.set("limit", "5");
    endpoint.searchParams.set("countrycodes", "us");
    endpoint.searchParams.set("viewbox", "-124.6,42.1,-114.0,32.4");
    endpoint.searchParams.set("bounded", "1");
    lastPlaceSearchAt = Date.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        referrer: `${window.location.origin}${window.location.pathname}`,
        referrerPolicy: "unsafe-url",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Place search service returned HTTP ${response.status}.`);
      }
      const places = await response.json();
      if (!Array.isArray(places)) {
        throw new Error("Place search service returned an unsupported response.");
      }
      placeSearchCache.set(normalizedTerm, places);
      if (placeSearchCache.size > 50) {
        placeSearchCache.delete(placeSearchCache.keys().next().value);
      }
      displayPlaceResults(places);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function searchMap() {
    const term = searchInput.value.trim();
    if (!term) {
      searchMessage.textContent = "Enter a place, landmark, business, or land-unit name.";
      return;
    }
    if (placeSearchInProgress) {
      return;
    }
    clearSearchResults();
    const match = refreshSearchableFeatures().find((featureLayer) => {
      const properties = featureLayer.feature.properties;
      const searchableText = [
        properties.Unit_Nm,
        properties.Loc_Nm,
        properties.Mang_Name,
      ].join(" ").toLocaleLowerCase();
      return searchableText.includes(term);
    });
    if (match) {
      const bounds = match.getBounds?.();
      if (bounds?.isValid()) {
        map.fitBounds(bounds.pad(0.15), { maxZoom: 10 });
        match.openPopup();
        searchMessage.textContent = `Showing ${match.feature.properties.Unit_Nm || "the matching unit"}.`;
        return;
      }
    }
    placeSearchInProgress = true;
    searchSubmit.disabled = true;
    searchSubmit.textContent = "…";
    searchMessage.textContent = "Searching California places…";
    try {
      await searchPlaces(term);
    } catch (error) {
      console.error("Place search failed.", error);
      searchMessage.textContent =
        error.name === "AbortError"
          ? "Place search timed out. Try again."
          : "Place search is unavailable. Check the provider endpoint or try again later.";
    } finally {
      placeSearchInProgress = false;
      searchSubmit.disabled = false;
      searchSubmit.textContent = "Go";
    }
  }

  searchSubmit.addEventListener("click", searchMap);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchMap();
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
    searchInput.value = "";
    clearSearchResults();
    searchMessage.textContent = "Search for California places or land units. Place searches are sent to OpenStreetMap when submitted; no autocomplete.";
  });
})();
