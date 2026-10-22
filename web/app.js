(() => {
  "use strict";

  const nativeApp = window.CampgroundlessNative ?? {
    isNative: false,
    publicUrl: (href) => href,
    haptic: () => {},
    share: async () => "unavailable",
  };
  const coverageStates = [
    { abbreviation: "CA", fips: "06", name: "California" },
    { abbreviation: "OR", fips: "41", name: "Oregon" },
    { abbreviation: "WA", fips: "53", name: "Washington" },
    { abbreviation: "ID", fips: "16", name: "Idaho" },
    { abbreviation: "NV", fips: "32", name: "Nevada" },
    { abbreviation: "UT", fips: "49", name: "Utah" },
    { abbreviation: "AZ", fips: "04", name: "Arizona" },
    { abbreviation: "CO", fips: "08", name: "Colorado" },
    { abbreviation: "NM", fips: "35", name: "New Mexico" },
    { abbreviation: "TX", fips: "48", name: "Texas" },
  ];
  const coverageStateCodes = coverageStates
    .map((state) => `'${state.abbreviation}'`)
    .join(",");
  const coverageStateFips = coverageStates
    .map((state) => `'${state.fips}'`)
    .join(",");
  const coverageBounds = L.latLngBounds(
    [25.8, -124.8],
    [49.1, -93.5],
  );
  const defaultLayerUrl =
    "https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/Manager_Name/FeatureServer/0";
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
  // Agency logos are bundled (copied from each agency's website) so they also show offline.
  const managerLogos = {
    BLM: "logos/blm.svg",
    FWS: "logos/fws.svg",
    NPS: "logos/nps.png",
    USACE: "logos/usace.svg",
    USBR: "logos/usbr.png",
    USFS: "logos/usfs.svg",
  };
  const federalManagerCodes = new Set([
    "BLM",
    "FWS",
    "NPS",
    "OTHF",
    "USACE",
    "USBR",
    "USFS",
  ]);
  const federalManagerLabels = {
    OTHF: "U.S.",
    USBR: "BOR",
  };
  const blmRecreationTypes = {
    "1": { label: "Information center site", color: "#cfeffc", usfsLabel: "Visitor Centers" },
    "2": { label: "Water based site", color: "#fbb3fc", npsIcon: "boat-launch" },
    "3": { label: "Overnight site", color: "#b3fcb8", npsIcon: "campsite" },
    "4": { label: "Day use site", color: "#fcd1b6", npsIcon: "picnic-area" },
    "5": { label: "Toilet", color: "#bdc4fc", npsIcon: "restrooms" },
    "6": { label: "Potable water", color: "#fcd4ee", npsIcon: "drinking-water" },
    "7": { label: "Trail head", color: "#fbfcbb", usfsLabel: "Trailhead" },
    "8": { label: "Parking area", color: "#b8fce6", npsIcon: "parking" },
    "9": { label: "Airplane landing strip", color: "#fcb3d1", npsIcon: "airfield" },
    "10": { label: "Campground", color: "#e3fcd7", usfsLabel: "Campground Camping" },
    "11": { label: "Natural / endangered area", color: "#fcefd7", npsIcon: "point-of-interest" },
    "12": { label: "OHV designated area", color: "#fcbebd", npsIcon: "all-terrain-trail" },
    "13": { label: "Recreation management area", color: "#c5d9fc" },
    "14": { label: "Unknown", color: "#e8c5fc", usfsLabel: "Unknown" },
  };
  async function blmTypeIcon(category) {
    if (category.usfsLabel) {
      return usfsSiteTypeIconByLabel(category.usfsLabel);
    }
    return category.npsIcon ? `icons/nps/${category.npsIcon}.svg` : "";
  }
  const blmRecreationDefaultType = { label: "Other / unclassified", color: "#828282" };

  function blmRecreationType(category) {
    return blmRecreationTypes[String(category)] ?? blmRecreationDefaultType;
  }

  let settings;
  try {
    settings = window.CampgroundlessSettings.read();
  } catch (error) {
    console.error("Could not read map settings.", error);
    settings = structuredClone(window.CampgroundlessSettings.defaults);
  }
  window.CampgroundlessSettings.applyTypography(settings);
  document.getElementById("land-disclaimer").hidden = settings.showLandDisclaimer === false;
  document.getElementById("boundary-data-notice").hidden = settings.showBoundaryData === false;
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
  L.Popup.mergeOptions({
    autoPan: false,
  });

  const map = L.map("map", {
    zoomControl: false,
    minZoom: 5,
    maxZoom: 18,
    maxBounds: coverageBounds.pad(0.6),
    maxBoundsViscosity: 0.7,
  }).fitBounds(coverageBounds);
  const usfsRecreationPane = map.createPane("usfsRecreationSites");
  usfsRecreationPane.style.zIndex = "420";
  usfsRecreationPane.style.pointerEvents = "auto";
  const censusStateService =
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer";
  let coverageStateGeometries = null;
  const coverageBoundaryPromise = queryArcGisFeatures(`${censusStateService}/0`, {
    where: `STATE IN (${coverageStateFips})`,
    outFields: "STATE",
    resultRecordCount: 10,
  }).then((data) => {
    const statesByFips = new Map(
      (data.features ?? []).map((feature) => [
        String(feature.properties?.STATE ?? ""),
        feature.geometry,
      ]),
    );
    const geometries = coverageStates.map((state) => statesByFips.get(state.fips));
    if (
      geometries.some(
        (geometry) =>
          !geometry || !["Polygon", "MultiPolygon"].includes(geometry.type),
      )
    ) {
      throw new Error("The Census Bureau did not return all coverage state boundaries.");
    }
    coverageStateGeometries = geometries;
    return geometries;
  });
  coverageBoundaryPromise.catch((error) => {
    console.warn("Could not load the multi-state coverage boundaries.", error);
  });
  const blmRecreationPane = map.createPane("blmRecreationSites");
  blmRecreationPane.style.zIndex = "430";
  blmRecreationPane.style.pointerEvents = "auto";

  L.control.scale({ imperial: true, metric: false, position: "bottomleft" }).addTo(map);
  searchMarkers.addTo(map);
  noteMarkers.addTo(map);
  sharedNoteMarkers.addTo(map);
  const referencePane = map.createPane("referenceOverlays");
  referencePane.style.zIndex = "420";
  referencePane.style.pointerEvents = "none";
  // Canvas-rendered land clicks target the canvas, not an SVG path, so they are
  // tracked by their DOM event instead of the .leaflet-interactive class.
  const landClickEvents = new WeakSet();
  // BLM road layers hold ~131,000 lines across the coverage area; drawing them
  // at regional zoom freezes the page.
  const vectorRoadMinZoom = 10;
  const zoomHints = new Set();
  // Declared early: the layer control's startup change handlers consult it.
  const offlineState = { active: false, reason: "", packs: [], layers: [], overlayLayers: new Map() };
  let liveOverlayLayers = {};
  let overlayDefinitionsByKey = {};
  function clickedMapFeature(event) {
    const original = event.originalEvent;
    return Boolean(
      original &&
        (landClickEvents.has(original) ||
          original.target?.closest?.(".leaflet-interactive")),
    );
  }
  function supportsWebGL() {
    try {
      return Boolean(document.createElement("canvas").getContext("webgl2") ||
        document.createElement("canvas").getContext("webgl"));
    } catch {
      return false;
    }
  }

  function createBasemap() {
    const basemapOptions = {
      maxZoom: 19,
      attribution: "",
    };
    let url;
    if (settings.basemap === "vector" && L.maplibreGL && supportsWebGL()) {
      map.getContainer().dataset.basemap = "vector";
      return L.maplibreGL({
        style: "https://tiles.openfreemap.org/styles/liberty",
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      });
    }
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
    map.getContainer().dataset.basemap =
      settings.basemap === "osm"
        ? `osm-${settings.osmLayer}`
        : settings.basemap && settings.basemap !== "vector"
          ? settings.basemap
          : "esri";
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

    if (offlineState.active) {
      layerStatus.textContent = "Style saved. Offline areas keep the basemap they were downloaded with.";
      return;
    }
    map.removeLayer(basemapLayer);
    basemapLayer = createBasemap().addTo(map);
    window.dispatchEvent(new CustomEvent("campgroundless:settingschange"));
  }

  let layerStatus;
  const activeRoadOverlays = new Map();
  const recreationOverlayCheckboxes = new Map();
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
    heading.textContent = "Map layers";
    layerStatus = L.DomUtil.create("span", "map-layer-status", panel);
    layerStatus.setAttribute("role", "status");

    const managerHeading = L.DomUtil.create("strong", "map-layer-heading", panel);
    managerHeading.textContent = "Land Managers";
    [
      ["forest", "U.S. Forest Service"],
      ["blm", "Bureau of Land Management"],
      ["state", "State public lands"],
      ["other", "Other public lands"],
    ].forEach(([value, label]) => {
      const managerLabel = L.DomUtil.create("label", "map-layer-option", panel);
      const managerInput = L.DomUtil.create("input", "", managerLabel);
      managerInput.type = "checkbox";
      managerInput.name = "manager";
      managerInput.value = value;
      const swatch = L.DomUtil.create("span", `filter-swatch swatch-${value}`, managerLabel);
      swatch.setAttribute("aria-hidden", "true");
      const managerText = L.DomUtil.create("span", "", managerLabel);
      managerText.textContent = label;
    });
    const managerSeparator = L.DomUtil.create("hr", "map-layer-separator", panel);
    managerSeparator.setAttribute("aria-hidden", "true");
    const styleSection = document.createElement("div");
    styleSection.className = "map-layer-style-section";
    const styleSeparator = L.DomUtil.create("hr", "map-layer-separator", styleSection);
    styleSeparator.setAttribute("aria-hidden", "true");
    const styleHeading = L.DomUtil.create("strong", "map-layer-heading", styleSection);
    styleHeading.textContent = "Map Style";

    const options = [
      ["vector", "Vector streets (crisp text)"],
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

    const activeStyle = options.some(([value]) => value === activeBasemapOption())
      ? activeBasemapOption()
      : "vector";

    options.forEach(([value, label], index) => {
      const optionLabel = L.DomUtil.create("label", "map-layer-option", styleSection);
      const radio = L.DomUtil.create("input", "", optionLabel);
      radio.type = "radio";
      radio.name = "map-style-choice";
      radio.value = value;
      radio.checked = value === activeStyle;
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

    const overlayHeading = L.DomUtil.create("strong", "map-layer-heading", panel);
    overlayHeading.textContent = "Reference Overlays";
    const overlayHelp = L.DomUtil.create("p", "map-layer-help", panel);
    overlayHelp.textContent =
      "USFS and BLM recreation sites share the visibility threshold saved in Settings. Click a mapped road or site for details; overlays do not confirm current access or camping permission.";

    const overlayDefinitions = {
      fsRecreation: {
        isRecreation: true,
        label: "USFS recreation sites",
        description: "Nightly-updated mapped facilities",
        legendTitle: "Recreation symbols",
        legendDescription: "Mapped recreation opportunity categories; not all sites are campgrounds.",
        url: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer",
        layers: [0],
        attribution: '<a href="https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer">USDA Forest Service Recreation Opportunities</a>',
      },
      blmRecreation: {
        type: "blm-sites",
        label: "BLM recreation sites",
        description: "National public-release points; interim data, verify details",
        legendTitle: "Recreation site symbol",
        legendDescription:
          "Circle colors follow BLM's mapped facility categories; they do not indicate current availability or camping permission.",
        url: "https://services1.arcgis.com/KbxwQRRfWyEYLgp4/arcgis/rest/services/BLM_National_Recreation_Site_Points/FeatureServer/2",
        where: `ADMIN_ST IN (${coverageStateCodes})`,
        fields: [
          "FET_TYPE",
          "FET_NAME",
          "FET_SUBTYPE",
          "UNIT_NAME",
          "DESCRIPTION",
          "WEB_LINK",
          "WEB_DISPLAY",
          "OBJECTID",
        ],
        pointStyle: {
          radius: 7,
          color: "#75451f",
          weight: 2,
          opacity: 1,
          fillColor: blmRecreationDefaultType.color,
          fillOpacity: 0.9,
        },
        attribution: '<a href="https://www.arcgis.com/home/item.html?id=7438e9e800914c94bad99f70a4f2092d">BLM National Recreation Site Points</a>',
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
        description: "National GTLF subset; zoom 10+; not proof of public access",
        legendTitle: "BLM GTLF road marking",
        legendDescription:
          "Solid green identifies this source dataset subset, not legal public access or current road status.",
        url: "https://services1.arcgis.com/KbxwQRRfWyEYLgp4/arcgis/rest/services/BLM_Natl_GTLF_Public_Motorized_Roads/FeatureServer/3",
        where: `ADMIN_ST IN (${coverageStateCodes})`,
        color: "#397b46",
        dashArray: null,
        attribution: '<a href="https://www.arcgis.com/home/item.html?id=f94999eb674d4085be0c86729fe4a151">BLM National Ground Transportation Linear Features (GTLF)</a>',
      },
      blmLimitedRoads: {
        isRoad: true,
        type: "feature",
        label: "BLM limited-public motorized roads",
        description: "National GTLF subset; zoom 10+; not a live access status",
        legendTitle: "BLM GTLF road marking",
        legendDescription:
          "Dashed rust identifies this source dataset subset, not legal access or current road status.",
        url: "https://services1.arcgis.com/KbxwQRRfWyEYLgp4/arcgis/rest/services/BLM_Natl_GTLF_Limited_Public_Motorized_Roads/FeatureServer/0",
        where: `ADMIN_ST IN (${coverageStateCodes})`,
        color: "#a45138",
        dashArray: "6 4",
        attribution: '<a href="https://www.arcgis.com/home/item.html?id=4a2d788c46804bfbb7288d05184e2936">BLM National Ground Transportation Linear Features (GTLF)</a>',
      },
    };
    const overlayLayers = {};
    liveOverlayLayers = overlayLayers;
    overlayDefinitionsByKey = overlayDefinitions;
    const overlayLoadRequests = new Map();
    const legendRequests = new Map();
    let sharedRoadRenderer;
    function roadRenderer() {
      sharedRoadRenderer ??= L.canvas({ pane: "referenceOverlays", padding: 0.3 });
      return sharedRoadRenderer;
    }

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
      if (definition.isRecreation || definition.type === "blm-sites") {
        recreationOverlayCheckboxes.set(key, checkbox);
      }
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
        if (definition.pointStyle) {
          for (const type of Object.values(blmRecreationTypes)) {
            const item = L.DomUtil.create("div", "map-mvum-legend-item", legendContent);
            const typeIcon = await blmTypeIcon(type);
            if (typeIcon) {
              const symbol = L.DomUtil.create(
                "img",
                `map-mvum-legend-symbol${type.npsIcon ? " nps-site-icon" : ""}`,
                item,
              );
              symbol.src = typeIcon;
              symbol.alt = "";
            } else {
              const symbol = L.DomUtil.create("span", "map-blm-site-symbol", item);
              symbol.style.backgroundColor = type.color;
            }
            const label = L.DomUtil.create("span", "", item);
            label.textContent = type.label;
          }
          const item = L.DomUtil.create("div", "map-mvum-legend-item", legendContent);
          const symbol = L.DomUtil.create("span", "map-blm-site-symbol", item);
          symbol.style.backgroundColor = blmRecreationDefaultType.color;
          const label = L.DomUtil.create("span", "", item);
          label.textContent = blmRecreationDefaultType.label;
          legendLoaded = true;
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
            rememberedJson(legendUrl, (data) => ({
              layers: (data.layers ?? []).map(({ layerId, layerName, legend }) => ({
                layerId,
                layerName,
                legend: (legend ?? []).map(({ contentType, imageData, label }) => ({ contentType, imageData, label })),
              })),
            })),
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
        updateRecreationSiteVisibility();
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
        if (offlineState.active) {
          if (liveOverlayLayers[key]) {
            map.removeLayer(liveOverlayLayers[key]);
          }
          syncOfflineOverlays();
          return;
        }

        if (checkbox.checked) {
          if (definition.type === "blm-sites") {
            if (!overlayLayers[key] && !overlayLoadRequests.has(key)) {
              const request = loadBlmRecreationOverlay(definition)
                .then((overlay) => {
                  overlayLayers[key] = overlay;
                  if (checkbox.checked && !offlineState.active) {
                    overlay.addTo(map);
                  }
                })
                .catch((error) => {
                  console.error(`Could not load the ${definition.label} layer.`, error);
                  if (checkbox.checked) {
                    layerStatus.textContent = `${definition.label} could not be loaded. The provider may be unavailable.`;
                  }
                })
                .finally(() => overlayLoadRequests.delete(key));
              overlayLoadRequests.set(key, request);
            }
            if (overlayLayers[key]) {
              overlayLayers[key].addTo(map);
            }
            return;
          }
          if (!overlayLayers[key]) {
            const overlay =
              definition.type === "feature"
                ? L.esri.featureLayer({
                    url: definition.url,
                    where: definition.where,
                    pane: "referenceOverlays",
                    renderer: roadRenderer(),
                    // Road details come from a point query on click, so the
                    // drawn lines need no attributes or hit testing.
                    interactive: false,
                    fields: ["OBJECTID"],
                    minZoom: vectorRoadMinZoom,
                    simplifyFactor: 0.5,
                    precision: 5,
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
                    pane: definition.isRecreation
                      ? "usfsRecreationSites"
                      : "referenceOverlays",
                    interactive: Boolean(definition.isRecreation),
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
          if (overlayLayers[key]) {
            overlayLayers[key].addTo(map);
          }
        } else if (overlayLayers[key]) {
          map.removeLayer(overlayLayers[key]);
        }
      });
      if (checkbox.checked) {
        checkbox.dispatchEvent(new Event("change"));
      }
    });

    panel.append(styleSection);
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

  function updateRecreationSiteVisibility() {
    const zoom = map.getZoom();
    const visible = zoom >= settings.recreationSitesMinZoom;
    usfsRecreationPane.style.visibility = visible ? "visible" : "hidden";
    blmRecreationPane.style.visibility = visible ? "visible" : "hidden";
    const anyRecreationOverlayEnabled = [...recreationOverlayCheckboxes.values()].some(
      (checkbox) => checkbox.checked,
    );
    const anyVectorRoadEnabled =
      settings.overlays.blmPublicRoads || settings.overlays.blmLimitedRoads;
    const messages = [];
    if (anyRecreationOverlayEnabled && !visible) {
      messages.push(
        `Zoom in to level ${settings.recreationSitesMinZoom} or closer to show both USFS and BLM recreation sites.`,
      );
    }
    if (anyVectorRoadEnabled && zoom < vectorRoadMinZoom && !offlineState.active) {
      messages.push(`Zoom in to level ${vectorRoadMinZoom} or closer to show BLM roads.`);
    }
    const message = messages.join(" ");
    if (message) {
      layerStatus.textContent = message;
      zoomHints.add(message);
    } else if (zoomHints.has(layerStatus.textContent)) {
      layerStatus.textContent = "";
    }
  }

  map.on("zoomend", updateRecreationSiteVisibility);
  updateRecreationSiteVisibility();

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

  function popupNoteIconMarkup(label = "Write a note at this location") {
    return `<button type="button" class="site-note-icon-button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Zm16.7-10.3a.93.93 0 0 0 0-1.3l-1.6-1.6a.93.93 0 0 0-1.3 0l-1.7 1.7 3.5 3.5 1.1-2.3Z"/>
      </svg>
    </button>`;
  }

  function bindBlmRecreationPopup(feature, layer, siteIconsByType) {
    const properties = feature.properties ?? {};
    const category = blmRecreationType(properties.FET_TYPE);
    layer.bindPopup(() => recreationSitePopup("Bureau of Land Management", {
      name: propertyValue(properties, "FET_NAME"),
      type: propertyValue(properties, "FET_SUBTYPE"),
      typeIcon: siteIconsByType.get(String(properties.FET_TYPE)) || "",
      typeMarker: true,
      typeMarkerColor: category.color,
      unit: propertyValue(properties, "UNIT_NAME"),
      description: propertyValue(properties, "DESCRIPTION"),
      link: propertyValue(properties, "WEB_LINK"),
    }), { maxWidth: 320, maxHeight: 360 });
    layer.on("popupopen", (event) => {
      bindPopupNoteIcon(event.popup, event.popup.getLatLng());
    });
    layer.on("click", (event) => {
      if (event.originalEvent) {
        L.DomEvent.stopPropagation(event.originalEvent);
      }
      layer.openPopup(event.latlng);
    });
  }

  function recreationSitePopup(agency, {
    name,
    type,
    typeIcon,
    typeMarker = false,
    unit,
    description,
    link,
    typeMarkerColor,
    details = [],
  }) {
    const cleanDescription = sourceDescription(description);
    let siteLink = "";
    try {
      const url = new URL(link);
      if (url.protocol === "https:") {
        siteLink = `<p><a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(agency)} site information</a></p>`;
      }
    } catch {}

    const detailMarkup = details
      .filter(([, value]) => value)
      .map(([label, value]) => {
        if (
          ["Reservations", "Restrictions", "Fee information"].includes(label)
        ) {
          const formattedText = sourceRestrictionText(value);
          return formattedText
            ? `<p class="site-restrictions"><strong>${escapeHtml(label)}:</strong><br>${escapeHtml(formattedText)}</p>`
            : "";
        }
        return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
      })
      .join("");
    return `<div class="map-popup">
        <div class="site-popup-header">
          <div class="map-popup-label">${escapeHtml(agency)} recreation site</div>
          ${popupNoteIconMarkup("Write a note at this site")}
        </div>
        <h3>${escapeHtml(name || `Unnamed ${agency} recreation site`)}</h3>
      ${type ? `<p class="site-type"><strong>Site type:</strong>${typeIcon
        ? `<img class="site-type-icon" src="${escapeHtml(typeIcon)}" alt="" aria-hidden="true">`
        : typeMarker
          ? `<span class="site-type-map-marker site-type-map-marker-blm" style="background-color: ${escapeHtml(typeMarkerColor || blmRecreationDefaultType.color)}" aria-hidden="true"></span>`
          : ""}<span>${escapeHtml(type)}</span></p>` : ""}
      ${unit ? `<p><strong>Administrative unit:</strong> ${escapeHtml(unit)}</p>` : ""}
      ${cleanDescription ? `<p>${escapeHtml(cleanDescription)}</p>` : ""}
      ${detailMarkup}
      ${siteLink}
      <p class="popup-warning">This mapped site record does not confirm it is currently open, available, or authorized for camping. Verify details and current rules with the local land manager.</p>
    </div>`;
  }

  function bindPopupNoteIcon(popup, location, iconSelect = null) {
    const button = popup.getElement()?.querySelector(".site-note-icon-button");
    if (!button) {
      return;
    }
    button.addEventListener("click", () => {
      openNoteEditor(location);
      if (!noteForm.hidden) {
        if (iconSelect) {
          noteIcon.value = iconSelect.value;
        }
        map.closePopup();
      }
    });
  }

  function sourceDescription(value) {
    if (!value) {
      return "";
    }
    return sourceHtmlDocument(value).body.textContent
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function sourceHtmlDocument(value) {
    const parser = new DOMParser();
    let source = String(value);
    let document;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      document = parser.parseFromString(source, "text/html");
      const decoded = document.body.textContent;
      if (
        document.body.children.length === 0 &&
        /<\/?[a-z][^>]*>/i.test(decoded)
      ) {
        source = decoded;
        continue;
      }
      break;
    }
    return document;
  }

  function sourceRestrictionText(value) {
    const document = sourceHtmlDocument(value);
    function textWithBlocks(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }
      const children = Array.from(node.childNodes, textWithBlocks).join("");
      if (node.tagName === "BR") {
        return "\n";
      }
      if (node.tagName === "A") {
        try {
          const url = new URL(node.getAttribute("href"), document.baseURI);
          if (url.protocol === "https:" && url.href !== children.trim()) {
            return `${children.trim() || url.href} (${url.href})`;
          }
        } catch {}
        return children;
      }
      if (node.tagName === "LI") {
        return `- ${children}\n`;
      }
      if (["DIV", "P"].includes(node.tagName)) {
        return `${children}\n`;
      }
      return children;
    }
    return textWithBlocks(document.body)
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
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
      isWithinCoverage([note.lng, note.lat])
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
    const url = new URL(nativeApp.publicUrl(window.location.href));
    url.hash = `shared-note=${encodeSharedNote(note)}`;
    return url.href;
  }

  async function shareNote(note) {
    const shareUrl = shareUrlForNote(note);
    if (nativeApp.isNative) {
      const result = await nativeApp.share({
        title: note.title || "Campgroundless map note",
        text: "View-only map note from Campgroundless",
        url: shareUrl,
      });
      if (result !== "unavailable") {
        return;
      }
    }
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
    if (!isWithinCoverage([location.lng, location.lat])) {
      selectedNoteLocation = null;
      setNoteMessage("Choose a point within California, Oregon, Washington, Idaho, Nevada, Utah, Arizona, Colorado, New Mexico, or Texas to save a note.", true);
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
    window.CampgroundlessSidebar?.show("saved");
    noteTitle.focus({ preventScroll: true });
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

  const noteMarkersById = new Map();
  const savedList = document.getElementById("saved-list");
  const savedEmpty = document.getElementById("saved-empty");

  function renderSavedList() {
    savedList.replaceChildren();
    notes.forEach((note) => {
      if (sharedNote?.id === note.id) {
        return;
      }
      const type = noteTypes[note.icon];
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "list-item";
      const name = document.createElement("strong");
      name.textContent = `${type.icon} ${note.title.trim() || type.label}`;
      const detail = document.createElement("small");
      detail.textContent = note.body.slice(0, 80);
      button.append(name, detail);
      button.addEventListener("click", () => {
        window.CampgroundlessSidebar?.hide();
        map.invalidateSize();
        map.setView([note.lat, note.lng], Math.max(map.getZoom(), 14));
        noteMarkersById.get(note.id)?.openPopup();
      });
      item.append(button);
      savedList.append(item);
    });
    savedEmpty.hidden = savedList.children.length > 0;
  }

  function renderNotes() {
    noteMarkers.clearLayers();
    noteMarkersById.clear();
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
      noteMarkersById.set(note.id, marker);
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
    renderSavedList();
  }

  const popupPadding = { top: 140, right: 72, bottom: 24, left: 24 };

  function keepPopupInView(popup) {
    const element = popup.getElement();
    if (!element || !popup.isOpen()) {
      return;
    }
    // Measuring during Leaflet's own auto-pan animation yields a stale position and over-pans.
    if (map._panAnim?._inProgress || map._animatingZoom) {
      map.once("moveend zoomend", () => window.setTimeout(() => keepPopupInView(popup), 60));
      return;
    }
    const mapRect = map.getContainer().getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (rect.top < mapRect.top + popupPadding.top) {
      dy = rect.top - (mapRect.top + popupPadding.top);
    } else if (rect.bottom > mapRect.bottom - popupPadding.bottom) {
      dy = rect.bottom - (mapRect.bottom - popupPadding.bottom);
    }
    // Keep the popup horizontally centered in the map so it never hugs a side.
    const dxCenter = rect.left + rect.width / 2 - (mapRect.left + mapRect.width / 2);
    if (Math.abs(dxCenter) > 2) {
      dx = dxCenter;
    }
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      map.panBy([dx, dy], { animate: true });
    }
  }

  map.on("popupopen", (event) => {
    const popup = event.popup;
    const content = popup.getElement();
    if (!content) {
      return;
    }
    let timer = null;
    const check = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => keepPopupInView(popup), 300);
    };
    check();
    content.addEventListener("load", check, true);
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(check);
      observer.observe(content);
      popup.once("remove", () => {
        observer.disconnect();
        window.clearTimeout(timer);
      });
    }
  });

  // Single clicks wait briefly so a double tap/click zooms in instead of opening a popup first.
  let pendingClick = null;
  let lastClickAt = 0;
  let lastClickPoint = null;
  map.doubleClickZoom.disable();
  map.getContainer().addEventListener(
    "click",
    (event) => {
      if (settings.popupClickBehavior === "replace") {
        return;
      }
      const popupOpen = map._popup && map.hasLayer(map._popup);
      if (!popupOpen || event.target.closest(".leaflet-popup, .leaflet-control")) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      map.closePopup();
      // A second tap right after this one is a double tap: zoom in where tapped.
      lastClickAt = Date.now();
      lastClickPoint = map.mouseEventToContainerPoint(event);
    },
    true,
  );
  map.on("click", (event) => {
    const now = Date.now();
    const point = event.containerPoint;
    const isDouble =
      lastClickPoint && now - lastClickAt < 320 && point.distanceTo(lastClickPoint) < 30;
    if (isDouble) {
      window.clearTimeout(pendingClick);
      pendingClick = null;
      lastClickAt = 0;
      lastClickPoint = null;
      map.closePopup();
      map.setZoomAround(point, Math.min(map.getZoom() + 1, map.getMaxZoom()));
      return;
    }
    lastClickAt = now;
    lastClickPoint = point;
    window.clearTimeout(pendingClick);
    pendingClick = window.setTimeout(() => {
      pendingClick = null;
      handleMapClick(event);
    }, 330);
  });
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
      setNoteMessage(nativeApp.isNative ? "Map note saved on this device." : "Map note saved in this browser.");
      nativeApp.haptic("success");
    } catch (error) {
      console.error("Could not save map note.", error);
      setNoteMessage("Could not save the note. Check this browser's storage settings.", true);
    }
  });
  renderNotes();

  if (sharedNote) {
    sharedNoteNotice.hidden = false;
    window.CampgroundlessSidebar?.show("saved");
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
    return `State_Nm IN (${coverageStateCodes}) AND FeatClass = 'Fee' AND Mang_Name IN (${quotedManagers})`;
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

  function managerIconMarkup(managerCode) {
    if (!federalManagerCodes.has(managerCode)) {
      return "";
    }
    const managerName = managerNames[managerCode] ?? "Federal land manager";
    const managerLogo = managerLogos[managerCode];
    if (!managerLogo) {
      return `<span class="mapped-land-agency-badge mapped-land-agency-badge-${managerCode.toLowerCase()}" role="img" aria-label="${escapeHtml(managerName)} icon">${escapeHtml(federalManagerLabels[managerCode] ?? managerCode)}</span>`;
    }
    return `<img class="mapped-land-logo mapped-land-logo-${managerCode.toLowerCase()}" data-manager-code="${escapeHtml(managerCode)}" src="${escapeHtml(managerLogo)}" alt="${escapeHtml(managerName)} logo" loading="lazy">`;
  }

  function createManagerIconFallback(managerCode) {
    const badge = document.createElement("span");
    badge.className = `mapped-land-agency-badge mapped-land-agency-badge-${managerCode.toLowerCase()}`;
    badge.setAttribute(
      "aria-label",
      `${managerNames[managerCode] ?? "Federal land manager"} icon`,
    );
    badge.setAttribute("role", "img");
    badge.textContent = federalManagerLabels[managerCode] ?? managerCode;
    return badge;
  }

  function bindManagerIconFallback(popupElement) {
    popupElement.querySelectorAll("img[data-manager-code]").forEach((logo) => {
      logo.addEventListener(
        "error",
        () => logo.replaceWith(createManagerIconFallback(logo.dataset.managerCode)),
        { once: true },
      );
    });
  }

  function appendManagerIcon(container, managerCode) {
    if (!federalManagerCodes.has(managerCode)) {
      return;
    }
    const managerLogo = managerLogos[managerCode];
    if (!managerLogo) {
      container.append(createManagerIconFallback(managerCode));
      return;
    }
    const logo = document.createElement("img");
    logo.className = `mapped-land-logo mapped-land-logo-${managerCode.toLowerCase()}`;
    logo.src = managerLogo;
    logo.alt = `${managerNames[managerCode]} logo`;
    logo.loading = "lazy";
    logo.onerror = () => logo.replaceWith(createManagerIconFallback(managerCode));
    container.append(logo);
  }

  function buildLandPopup(feature) {
    const properties = feature.properties ?? {};
    const managerCode = properties.Mang_Name;
    const manager = managerNames[managerCode] ?? "Public land manager (not specified)";
    const unit = properties.Unit_Nm || properties.Loc_Nm || "Unnamed land unit";
    const access = properties.Pub_Access;
    const sourceDate = properties.Src_Date;
    const accessLabels = {
      OA: "Open access",
      RA: "Restricted access (permit, fee, or seasonal limits may apply)",
      XA: "Closed access",
      UK: "Unknown access",
    };
    const accessText = access
      ? escapeHtml(accessLabels[String(access).toUpperCase()] || `Unrecognized code (${access})`)
      : "Not provided";
    const sourceDateText = sourceDate ? escapeHtml(sourceDate) : "Not provided";
    const popup = `
      <div class="map-popup">
        <div class="site-popup-header">
          <div class="map-popup-label">${managerIconMarkup(managerCode)}${escapeHtml(manager)}</div>
          ${popupNoteIconMarkup("Write a note at this location")}
        </div>
        <h3>${escapeHtml(unit)}</h3>
        <p><strong>Public access type:</strong> ${accessText}</p>
        <p><strong>Nearest named road (Census):</strong> <span class="nearest-road-value">Looking up nearby named roads…</span></p>
        <div class="feature-note-action">
          <label for="feature-note-icon">Choose a note marker icon</label>
          <select id="feature-note-icon" class="feature-note-icon-select" aria-label="Choose a note icon">${noteIconOptions}</select>
        </div>
        <p class="popup-warning">Distance is straight-line to the nearest mapped road segment. Census data does not confirm legal public access or current conditions.</p>
        <p class="popup-warning">Camping permission is not determined here. Contact this land manager before camping.</p>
        <p>Source date recorded: ${sourceDateText}</p>
      </div>`;
    return popup;
  }

  // Popup markup is built on demand; thousands of land features load at once.
  function createPopup(feature, layer) {
    layer.bindPopup(() => buildLandPopup(feature), { maxWidth: 300, maxHeight: 320 });
    layer.on("popupopen", (event) => {
      const popupElement = event.popup.getElement();
      bindManagerIconFallback(popupElement);
      const iconSelect = popupElement.querySelector(".feature-note-icon-select");
      const nearestRoadValue = popupElement.querySelector(".nearest-road-value");
      if (nearestRoadValue) {
        void loadNearestRoadDescription(event.popup.getLatLng(), nearestRoadValue);
      }
      bindPopupNoteIcon(event.popup, event.popup.getLatLng(), iconSelect);
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
      settings.dataSource === "custom" ? "FID" : "OBJECTID",
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
    // Canvas keeps tens of thousands of polygons out of the DOM.
    renderer: L.canvas({ padding: 0.3 }),
    style: featureStyle,
    onEachFeature: createPopup,
  };
  const landLayer = L.esri.featureLayer(landLayerOptions);
  function handleLandFeatureClick(event) {
    if (event.originalEvent) {
      landClickEvents.add(event.originalEvent);
    }
    if (activeRoadOverlays.size === 0) {
      return;
    }
    if (event.originalEvent) {
      L.DomEvent.stopPropagation(event.originalEvent);
    }
    handleMapClick(event, true);
  }
  landLayer.on("click", handleLandFeatureClick);

  landLayer.on("load", () => {
    mapLoading.hidden = true;
    mapStatus.textContent =
      settings.dataSource === "custom"
        ? "Custom land boundaries loaded"
        : "Public land boundaries loaded · PAD-US 3.0";
    mapStatus.classList.remove("error");
  });

  landLayer.on("requesterror", () => {
    if (offlineState.active) {
      return;
    }
    mapLoading.hidden = true;
    mapStatus.textContent = "Land data unavailable · try again later";
    mapStatus.classList.add("error");
    void checkConnectivityAfterFailure();
  });

  landLayer.addTo(map);

  const censusRoadService =
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer";
  const nearbyRoadSearchMeters = 10000;
  let roadLookupSequence = 0;
  let nearestRoadLookupSequence = 0;
  let recreationLookupSequence = 0;
  let pointLandLookupSequence = 0;
  let usfsSymbolRendererPromise;

  async function usfsSymbolRendererInfos() {
    if (!usfsSymbolRendererPromise) {
      usfsSymbolRendererPromise = rememberedJson(
        "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer/0?f=pjson",
        (layer) =>
          (layer.drawingInfo?.renderer?.uniqueValueInfos ?? []).map(({ value, label, symbol }) => ({
            value,
            label,
            symbol: symbol && { contentType: symbol.contentType, imageData: symbol.imageData },
          })),
      )
        .catch((error) => {
          console.error("Could not load Forest Service recreation-site symbols.", error);
          usfsSymbolRendererPromise = undefined;
          return [];
        });
    }
    return usfsSymbolRendererPromise;
  }

  function rendererSymbolImage(symbol) {
    if (
      !symbol?.imageData ||
      !/^image\/(png|gif|jpeg)$/i.test(symbol.contentType || "")
    ) {
      return "";
    }
    return `data:${symbol.contentType};base64,${symbol.imageData}`;
  }

  async function usfsSiteTypeIcon(markerType) {
    if (!markerType) {
      return "";
    }
    const symbol = (await usfsSymbolRendererInfos()).find(
      (info) => info.value === markerType,
    )?.symbol;
    return rendererSymbolImage(symbol);
  }

  async function usfsSiteTypeIconByLabel(label) {
    if (!label) {
      return "";
    }
    const symbol = (await usfsSymbolRendererInfos()).find(
      (info) => info.label === label,
    )?.symbol;
    return rendererSymbolImage(symbol);
  }

  // Fetches a small service response (symbols, legends) and keeps the useful part on this
  // device, so icons and legends still appear when there is no connection.
  async function rememberedJson(url, pick) {
    const key = `campgroundless.service-cache.v1:${url}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}).`);
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || "The service returned an error.");
      }
      const value = pick(data);
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage full: the response still works for this session.
      }
      return value;
    } catch (error) {
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved);
      }
      throw error;
    }
  }

  async function queryArcGisFeatures(layerUrl, {
    where = "1=1",
    geometry,
    geometryType,
    outFields = "*",
    token,
    objectIds,
    resultRecordCount = 2000,
  }) {
    const url = `${layerUrl.replace(/\/+$/, "")}/query`;
    const parameters = new URLSearchParams({
      where,
      inSR: "4326",
      outSR: "4326",
      outFields,
      returnGeometry: "true",
      resultRecordCount: String(resultRecordCount),
      f: "geojson",
    });
    if (geometry && geometryType) {
      parameters.set(
        "geometry",
        typeof geometry === "string" ? geometry : JSON.stringify(geometry),
      );
      parameters.set("geometryType", geometryType);
      parameters.set("spatialRel", "esriSpatialRelIntersects");
    }
    if (objectIds) {
      parameters.set("objectIds", objectIds);
    }
    if (token) {
      parameters.set("token", token);
    }
    const response = objectIds
      ? await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: parameters,
        })
      : await fetch(`${url}?${parameters}`);
    if (!response.ok) {
      throw new Error(`Map data request failed (${response.status}).`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "Map data provider returned an error.");
    }
    return data;
  }

  async function showUsfsRecreationDetails(location) {
    const lookupId = ++recreationLookupSequence;
    const toleranceMeters = roadClickToleranceMeters(location);
    const envelope = roadQueryEnvelope(location, toleranceMeters);
    try {
      const data = await queryArcGisFeatures(
        "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer/0",
        {
          geometry: `${envelope.xmin},${envelope.ymin},${envelope.xmax},${envelope.ymax}`,
          geometryType: "esriGeometryEnvelope",
          outFields: "*",
          resultRecordCount: 50,
        },
      );
      if (lookupId !== recreationLookupSequence) {
        return null;
      }
      if (data.exceededTransferLimit || (data.features ?? []).length >= 50) {
        throw new Error("The Forest Service returned an incomplete set of nearby sites.");
      }
      const closest = (data.features ?? [])
        .filter((feature) => feature.geometry?.type === "Point")
        .map((feature) => ({
          feature,
          distance: map.distance(
            location,
            L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]),
          ),
        }))
        .filter((site) => site.distance <= toleranceMeters)
        .sort((first, second) => first.distance - second.distance)[0];
      if (!closest) {
        return false;
      }

      const popup = L.popup({ maxWidth: 340, maxHeight: 400 }).setLatLng(location);
      const properties = closest.feature.properties ?? {};
      const season = [
        propertyValue(properties, "OPEN_SEASON_START"),
        propertyValue(properties, "OPEN_SEASON_END"),
      ]
        .filter(Boolean)
        .join(" – ");
      const reportedStatus = propertyValue(properties, "OPENSTATUS");
      const details = [
        ["Reported status", reportedStatus.toLowerCase() === "none" ? "" : reportedStatus],
        ["Season", season],
        ["Activities", propertyValue(properties, "MARKERACTIVITY")],
        ["Operational hours", propertyValue(properties, "OPERATIONAL_HOURS")],
        ["Reservations", propertyValue(properties, "RESERVATION_INFO")],
        ["Restrictions", propertyValue(properties, "RESTRICTIONS")],
        ["Accessibility", propertyValue(properties, "ACCESSIBILITY")],
        ["Fee information", propertyValue(properties, "FEEDESCRIPTION")],
      ];
      const type = propertyValue(properties, "MARKERACTIVITYGROUP");
      const typeIcon = await usfsSiteTypeIcon(propertyValue(properties, "MARKERTYPE"));
      if (lookupId !== recreationLookupSequence) {
        return null;
      }
      popup.setContent(recreationSitePopup("U.S. Forest Service", {
        name: propertyValue(properties, "RECAREANAME"),
        type,
        typeIcon,
        unit: propertyValue(properties, "FORESTNAME"),
        description: sourceDescription(propertyValue(properties, "RECAREADESCRIPTION")),
        link: propertyValue(properties, "RECAREAURL"),
        details,
      }));
      map.attributionControl.addAttribution(
        '<a href="https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer">USDA Forest Service Recreation Opportunities</a>',
      );
      popup.openOn(map);
      bindPopupNoteIcon(
        popup,
        L.latLng(
          closest.feature.geometry.coordinates[1],
          closest.feature.geometry.coordinates[0],
        ),
      );
      return true;
    } catch (error) {
      console.error("Could not retrieve Forest Service recreation site details.", error);
      return false;
    }
  }

  // Edges bucketed into horizontal bands so a point test only scans edges
  // near its latitude; state boundaries have tens of thousands of vertices.
  const ringIndexes = new WeakMap();
  function ringIndex(ring) {
    let index = ringIndexes.get(ring);
    if (index) {
      return index;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    ring.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    const bandCount = Math.max(1, Math.min(1024, Math.floor(ring.length / 8)));
    const bandHeight = (maxY - minY) / bandCount || 1;
    const bands = Array.from({ length: bandCount }, () => []);
    const bandOf = (y) =>
      Math.min(bandCount - 1, Math.max(0, Math.floor((y - minY) / bandHeight)));
    for (let edge = 0, previous = ring.length - 1; edge < ring.length; previous = edge++) {
      const y1 = ring[previous][1];
      const y2 = ring[edge][1];
      for (let band = bandOf(Math.min(y1, y2)); band <= bandOf(Math.max(y1, y2)); band += 1) {
        bands[band].push(edge);
      }
    }
    index = { minX, minY, maxX, maxY, bands, bandOf };
    ringIndexes.set(ring, index);
    return index;
  }

  function pointInRing(point, ring) {
    if (!Array.isArray(ring) || ring.length < 3) {
      return false;
    }
    const index = ringIndex(ring);
    if (
      point[0] < index.minX - 1e-10 ||
      point[0] > index.maxX + 1e-10 ||
      point[1] < index.minY - 1e-10 ||
      point[1] > index.maxY + 1e-10
    ) {
      return false;
    }
    let inside = false;
    for (const edge of index.bands[index.bandOf(point[1])]) {
      const previous = edge === 0 ? ring.length - 1 : edge - 1;
      const [x1, y1] = ring[previous];
      const [x2, y2] = ring[edge];
      const cross = (point[0] - x1) * (y2 - y1) - (point[1] - y1) * (x2 - x1);
      if (
        Math.abs(cross) < 1e-10 &&
        point[0] >= Math.min(x1, x2) - 1e-10 &&
        point[0] <= Math.max(x1, x2) + 1e-10 &&
        point[1] >= Math.min(y1, y2) - 1e-10 &&
        point[1] <= Math.max(y1, y2) + 1e-10
      ) {
        return true;
      }
      if ((y1 > point[1]) !== (y2 > point[1])) {
        const crossingX = ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1;
        if (point[0] < crossingX) {
          inside = !inside;
        }
      }
    }
    return inside;
  }

  function pointInStateBoundary(point, geometry) {
    const polygons =
      geometry?.type === "Polygon"
        ? [geometry.coordinates]
        : geometry?.type === "MultiPolygon"
          ? geometry.coordinates
          : [];
    return polygons.some(
      (rings) =>
        Array.isArray(rings) &&
        rings.length > 0 &&
        pointInRing(point, rings[0]) &&
        !rings.slice(1).some((ring) => pointInRing(point, ring)),
    );
  }

  function isWithinCoverage(point) {
    if (!coverageBounds.contains([point[1], point[0]])) {
      return false;
    }
    return (
      !coverageStateGeometries ||
      coverageStateGeometries.some((geometry) =>
        pointInStateBoundary(point, geometry),
      )
    );
  }

  async function queryArcGisObjectIds(layerUrl, where) {
    const parameters = new URLSearchParams({
      where,
      returnIdsOnly: "true",
      f: "json",
    });
    const response = await fetch(
      `${layerUrl.replace(/\/+$/, "")}/query?${parameters}`,
    );
    if (!response.ok) {
      throw new Error(`Map data request failed (${response.status}).`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "Map data provider returned an error.");
    }
    if (!Array.isArray(data.objectIds)) {
      throw new Error("The BLM recreation service did not return feature IDs.");
    }
    return data.objectIds;
  }

  async function loadBlmRecreationOverlay(definition) {
    await coverageBoundaryPromise;
    const objectIds = await queryArcGisObjectIds(definition.url, definition.where);
    const batches = [];
    for (let offset = 0; offset < objectIds.length; offset += 500) {
      batches.push(objectIds.slice(offset, offset + 500));
    }
    const sitePages = [];
    for (let offset = 0; offset < batches.length; offset += 4) {
      sitePages.push(
        ...(await Promise.all(
          batches.slice(offset, offset + 4).map((batch) =>
            queryArcGisFeatures(definition.url, {
              where: "1=1",
              objectIds: batch.join(","),
              outFields: definition.fields.join(","),
              resultRecordCount: 500,
            }),
          ),
        )),
      );
    }
    if (
      sitePages.some(
        (page) => page.exceededTransferLimit || !Array.isArray(page.features),
      )
    ) {
      throw new Error("The BLM recreation-site query was incomplete.");
    }
    const features = sitePages.flatMap((page) => page.features).filter((feature) => {
      const coordinates = feature.geometry?.coordinates;
      return (
        feature.geometry?.type === "Point" &&
        Array.isArray(coordinates) &&
        isWithinCoverage(coordinates)
      );
    });
    return buildBlmRecreationLayer(features, definition);
  }

  async function buildBlmRecreationLayer(features, definition) {
    const siteIconsByType = new Map();
    await Promise.all(
      Object.entries(blmRecreationTypes)
        .map(async ([type, category]) => {
          const icon = await blmTypeIcon(category);
          if (icon) {
            siteIconsByType.set(type, icon);
          }
        }),
    );
    const sites = L.geoJSON({ type: "FeatureCollection", features }, {
      attribution: definition.attribution,
      pointToLayer: (feature, latlng) => {
        const type = String(feature.properties?.FET_TYPE ?? "");
        const category = blmRecreationType(type);
        const typeIcon = siteIconsByType.get(type);
        if (typeIcon) {
          return L.marker(latlng, {
            pane: "blmRecreationSites",
            icon: L.icon({
              iconUrl: typeIcon,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
              popupAnchor: [0, -10],
              className: `blm-recreation-site-marker${category.npsIcon ? " nps-site-icon" : ""}`,
            }),
          });
        }
        return L.circleMarker(latlng, {
          ...definition.pointStyle,
          fillColor: category.color,
          pane: "blmRecreationSites",
          className: "blm-recreation-site-marker",
        });
      },
      onEachFeature: (feature, layer) =>
        bindBlmRecreationPopup(feature, layer, siteIconsByType),
    });
    return createViewportLayer(sites.getLayers(), definition.attribution);
  }

  // Keeps only markers near the current view on the map, and none below the
  // recreation-site zoom threshold, instead of thousands of DOM markers.
  function createViewportLayer(markers, attribution) {
    const group = L.layerGroup([], { attribution });
    const shown = new Set();
    function update() {
      const zoomVisible = map.getZoom() >= settings.recreationSitesMinZoom;
      const bounds = map.getBounds().pad(0.25);
      markers.forEach((marker) => {
        const show = zoomVisible && bounds.contains(marker.getLatLng());
        if (show && !shown.has(marker)) {
          group.addLayer(marker);
          shown.add(marker);
        } else if (!show && shown.has(marker)) {
          group.removeLayer(marker);
          shown.delete(marker);
        }
      });
    }
    group.on("add", () => {
      map.on("moveend", update);
      update();
    });
    group.on("remove", () => map.off("moveend", update));
    return group;
  }

  async function showBlmRecreationDetails(location) {
    const lookupId = ++recreationLookupSequence;
    const toleranceMeters = roadClickToleranceMeters(location);
    const envelope = roadQueryEnvelope(location, toleranceMeters);
    try {
      const data = await queryArcGisFeatures(
        "https://services1.arcgis.com/KbxwQRRfWyEYLgp4/arcgis/rest/services/BLM_National_Recreation_Site_Points/FeatureServer/2",
        {
          where: `ADMIN_ST IN (${coverageStateCodes})`,
          geometry: `${envelope.xmin},${envelope.ymin},${envelope.xmax},${envelope.ymax}`,
          geometryType: "esriGeometryEnvelope",
          outFields: "FET_TYPE,FET_NAME,FET_SUBTYPE,UNIT_NAME,DESCRIPTION,WEB_LINK,WEB_DISPLAY,OBJECTID",
          resultRecordCount: 50,
        },
      );
      if (lookupId !== recreationLookupSequence) {
        return null;
      }
      if (data.exceededTransferLimit || (data.features ?? []).length >= 50) {
        throw new Error("The BLM returned an incomplete set of nearby recreation sites.");
      }
      const closest = (data.features ?? [])
        .filter((feature) => feature.geometry?.type === "Point")
        .map((feature) => ({
          feature,
          distance: map.distance(
            location,
            L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]),
          ),
        }))
        .filter((site) => site.distance <= toleranceMeters)
        .sort((first, second) => first.distance - second.distance)[0];
      if (!closest) {
        return false;
      }

      const properties = closest.feature.properties ?? {};
      const category = blmRecreationType(properties.FET_TYPE);
      const typeIcon = await blmTypeIcon(category);
      if (lookupId !== recreationLookupSequence) {
        return null;
      }
      const popup = L.popup({ maxWidth: 320, maxHeight: 360 })
        .setLatLng(L.latLng(
          closest.feature.geometry.coordinates[1],
          closest.feature.geometry.coordinates[0],
        ))
        .setContent(recreationSitePopup("Bureau of Land Management", {
          name: propertyValue(properties, "FET_NAME"),
          type: propertyValue(properties, "FET_SUBTYPE"),
          typeIcon,
          typeMarker: true,
          typeMarkerColor: category.color,
          unit: propertyValue(properties, "UNIT_NAME"),
          description: propertyValue(properties, "DESCRIPTION"),
          link: propertyValue(properties, "WEB_LINK"),
        }))
        .openOn(map);
      bindPopupNoteIcon(popup, popup.getLatLng());
      map.attributionControl.addAttribution(
        '<a href="https://www.arcgis.com/home/item.html?id=7438e9e800914c94bad99f70a4f2092d">BLM National Recreation Site Points</a>',
      );
      return true;
    } catch (error) {
      console.error("Could not retrieve BLM recreation site details.", error);
      return false;
    }
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
    if (offlineState.active) {
      return offlineRoadsNear(definition, location, toleranceMeters);
    }
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
    if (offlineState.active) {
      return offlineLandAtPoint(location);
    }
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
    return nearestPointOnRoad(location, geometry)?.distance ?? Infinity;
  }

  function roadLineCoordinates(geometry) {
    return geometry?.type === "LineString"
      ? [geometry.coordinates]
      : geometry?.type === "MultiLineString"
        ? geometry.coordinates
        : [];
  }

  function projectPointToSegment(location, first, second) {
    const earthRadius = 6371008.8;
    const latitudeRadians = (location.lat * Math.PI) / 180;
    const metersPerDegreeLatitude = (Math.PI * earthRadius) / 180;
    const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos(latitudeRadians);
    const ax = (first[0] - location.lng) * metersPerDegreeLongitude;
    const ay = (first[1] - location.lat) * metersPerDegreeLatitude;
    const bx = (second[0] - location.lng) * metersPerDegreeLongitude;
    const by = (second[1] - location.lat) * metersPerDegreeLatitude;
    const segmentX = bx - ax;
    const segmentY = by - ay;
    const segmentLength = Math.hypot(segmentX, segmentY);
    const segmentLengthSquared = segmentLength * segmentLength;
    const fraction =
      segmentLengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, -(ax * segmentX + ay * segmentY) / segmentLengthSquared),
          );
    return {
      fraction,
      distance: Math.hypot(ax + fraction * segmentX, ay + fraction * segmentY),
      length: segmentLength,
      heading: Math.atan2(segmentY, segmentX),
      point: {
        lat: first[1] + fraction * (second[1] - first[1]),
        lng: first[0] + fraction * (second[0] - first[0]),
      },
    };
  }

  function nearestPointOnRoad(location, geometry) {
    let nearest = null;
    roadLineCoordinates(geometry).forEach((line) => {
      for (let index = 1; index < line.length; index += 1) {
        const projected = projectPointToSegment(location, line[index - 1], line[index]);
        if (!nearest || projected.distance < nearest.distance) {
          nearest = projected;
        }
      }
    });
    return nearest;
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
    if (offlineState.active) {
      throw new OfflineUnavailableError();
    }
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

  async function findRoadNetworkDistance(location, sourceGeometry) {
    if (offlineState.active) {
      throw new OfflineUnavailableError();
    }
    const sourcePoint = nearestPointOnRoad(location, sourceGeometry);
    if (!sourcePoint) {
      return { road: null, reason: "The selected overlay did not return usable road geometry." };
    }

    const dataByLayer = await Promise.all(
      [2, 6, 8].map((layerId) =>
        queryArcGisFeatures(`${censusRoadService}/${layerId}`, {
          geometry: roadQueryEnvelope(location, nearbyRoadSearchMeters),
          geometryType: "esriGeometryEnvelope",
          outFields: "NAME,BASENAME,MTFCC,RTTYP",
          resultRecordCount: 2000,
        }),
      ),
    );
    if (
      dataByLayer.some(
        (data) => data.exceededTransferLimit === true || (data.features ?? []).length >= 2000,
      )
    ) {
      return { road: null, reason: "Census road results were truncated in this area." };
    }

    const adjacency = new Map();
    const roadSegments = [];
    const nodeFor = (coordinate) => `${coordinate[0].toFixed(6)},${coordinate[1].toFixed(6)}`;
    const addSegment = (first, second, road) => {
      const projected = projectPointToSegment(sourcePoint.point, first, second);
      if (projected.length < 0.01) {
        return;
      }
      const segment = {
        firstNode: nodeFor(first),
        secondNode: nodeFor(second),
        length: projected.length,
        road,
      };
      roadSegments.push({ ...segment, projected });
      const firstEdges = adjacency.get(segment.firstNode) ?? [];
      firstEdges.push({ node: segment.secondNode, length: segment.length, road });
      adjacency.set(segment.firstNode, firstEdges);
      const secondEdges = adjacency.get(segment.secondNode) ?? [];
      secondEdges.push({ node: segment.firstNode, length: segment.length, road });
      adjacency.set(segment.secondNode, secondEdges);
    };

    dataByLayer.forEach((data) => {
      (data.features ?? []).forEach((feature) => {
        const roadName = propertyValue(feature.properties, "NAME", "BASENAME");
        const road = roadName
          ? { name: roadName, type: censusRoadType(feature.properties) }
          : null;
        roadLineCoordinates(feature.geometry).forEach((line) => {
          for (let index = 1; index < line.length; index += 1) {
            addSegment(line[index - 1], line[index], road);
          }
        });
      });
    });

    let sourceSegment = null;
    roadSegments.forEach((segment) => {
      if (!sourceSegment || segment.projected.distance < sourceSegment.projected.distance) {
        sourceSegment = segment;
      }
    });
    const maxSnapDistanceMeters = 20;
    const headingDifference = sourceSegment
      ? Math.abs(
          Math.atan2(
            Math.sin(2 * (sourceSegment.projected.heading - sourcePoint.heading)),
            Math.cos(2 * (sourceSegment.projected.heading - sourcePoint.heading)),
          ) / 2,
        )
      : Infinity;
    if (
      !sourceSegment ||
      sourceSegment.projected.distance > maxSnapDistanceMeters ||
      headingDifference > Math.PI / 4
    ) {
      return {
        road: null,
        reason: `No aligned Census road geometry matches the selected route within ${Math.round(
          maxSnapDistanceMeters * 3.28084,
        )} ft.`,
      };
    }
    if (sourceSegment.road) {
      return { road: sourceSegment.road, distance: 0, snapDistance: sourceSegment.projected.distance };
    }

    const distances = new Map();
    const queue = [];
    const push = (entry) => {
      let index = queue.length;
      queue.push(entry);
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (queue[parent].distance <= entry.distance) {
          break;
        }
        queue[index] = queue[parent];
        index = parent;
      }
      queue[index] = entry;
    };
    const pop = () => {
      const first = queue[0];
      const last = queue.pop();
      if (queue.length && last) {
        let index = 0;
        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          if (left >= queue.length) {
            break;
          }
          const child =
            right < queue.length && queue[right].distance < queue[left].distance
              ? right
              : left;
          if (queue[child].distance >= last.distance) {
            break;
          }
          queue[index] = queue[child];
          index = child;
        }
        queue[index] = last;
      }
      return first;
    };
    const firstDistance = sourceSegment.projected.fraction * sourceSegment.length;
    const secondDistance = (1 - sourceSegment.projected.fraction) * sourceSegment.length;
    distances.set(sourceSegment.firstNode, firstDistance);
    distances.set(sourceSegment.secondNode, secondDistance);
    push({ node: sourceSegment.firstNode, distance: firstDistance });
    push({ node: sourceSegment.secondNode, distance: secondDistance });

    const maxNetworkDistanceMeters = 50000;
    while (queue.length) {
      const current = pop();
      if (current.distance !== distances.get(current.node)) {
        continue;
      }
      if (current.distance > maxNetworkDistanceMeters) {
        break;
      }
      const edges = adjacency.get(current.node) ?? [];
      const namedEdge = edges.find((edge) => edge.road);
      if (namedEdge) {
        return {
          road: namedEdge.road,
          distance: current.distance,
          snapDistance: sourceSegment.projected.distance,
        };
      }
      edges.forEach((edge) => {
        if (edge.road) {
          return;
        }
        const nextDistance = current.distance + edge.length;
        if (
          nextDistance <= maxNetworkDistanceMeters &&
          nextDistance < (distances.get(edge.node) ?? Infinity)
        ) {
          distances.set(edge.node, nextDistance);
          push({ node: edge.node, distance: nextDistance });
        }
      });
    }
    return {
      road: null,
      reason: "No connected named road was found within 31 mi of mapped road travel.",
    };
  }

  function nearestRoadDescription(result) {
    if (!result.road) {
      return `No named road found within ${distanceDescription(nearbyRoadSearchMeters)}.`;
    }
    return `${result.road.name} · ${result.road.type} · ${distanceDescription(result.road.distance)} straight-line${
      result.incomplete ? " (nearby results may be incomplete)" : ""
    }`;
  }

  async function loadNearestRoadDescription(location, target) {
    const lookupId = ++nearestRoadLookupSequence;
    map.attributionControl.addAttribution(
      '<a href="https://tigerweb.geo.census.gov/">U.S. Census Bureau TIGERweb Roads</a>',
    );
    try {
      const result = await findNearestNamedRoad(location);
      if (lookupId === nearestRoadLookupSequence && target.isConnected) {
        target.textContent = nearestRoadDescription(result);
      }
    } catch (error) {
      console.error("Could not find a nearby named road.", error);
      if (lookupId === nearestRoadLookupSequence && target.isConnected) {
        target.textContent = offlineState.active
          ? "Unavailable offline (needs a data connection)."
          : "Named-road distance could not be looked up.";
      }
    }
  }

  function osmTag(place, ...keys) {
    const tags = place?.extratags ?? {};
    for (const key of keys) {
      const value = tags[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  }

  function safeHttpUrl(value) {
    if (!value) {
      return "";
    }
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function placeName(place) {
    return (place.name || place.display_name?.split(",")[0] || "Search result").trim();
  }

  function placeFacts(place) {
    const facts = [];
    const type = [place.category, place.type]
      .filter((part) => part && part !== "yes")
      .map((part) => String(part).replaceAll("_", " "))
      .join(" · ");
    if (type) {
      facts.push(["Type", escapeHtml(type)]);
    }
    if (place.display_name) {
      facts.push(["Address", escapeHtml(place.display_name)]);
    }
    const phone = osmTag(place, "phone", "contact:phone");
    if (phone) {
      const tel = phone.replace(/[^\d+]/g, "");
      facts.push(["Phone", tel ? `<a href="tel:${escapeHtml(tel)}">${escapeHtml(phone)}</a>` : escapeHtml(phone)]);
    }
    const website = safeHttpUrl(osmTag(place, "website", "contact:website", "url"));
    if (website) {
      facts.push(["Website", `<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`]);
    }
    const email = osmTag(place, "email", "contact:email");
    if (email && /^[^\s@<>]+@[^\s@<>]+$/.test(email)) {
      facts.push(["Email", `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`]);
    }
    const hours = osmTag(place, "opening_hours");
    if (hours) {
      facts.push(["Hours", escapeHtml(hours)]);
    }
    [
      ["Operator", ["operator"]],
      ["Fee", ["fee"]],
      ["Reservation", ["reservation"]],
      ["Capacity", ["capacity"]],
      ["Description", ["description"]],
    ].forEach(([label, keys]) => {
      const value = osmTag(place, ...keys);
      if (value) {
        facts.push([label, escapeHtml(value)]);
      }
    });
    return facts;
  }

  function placeNoteBody(place) {
    const lines = [place.display_name];
    const phone = osmTag(place, "phone", "contact:phone");
    const website = safeHttpUrl(osmTag(place, "website", "contact:website", "url"));
    if (phone) {
      lines.push(`Phone: ${phone}`);
    }
    if (website) {
      lines.push(`Website: ${website}`);
    }
    return lines.filter(Boolean).join("\n").slice(0, 1200);
  }

  function savePlace(place) {
    const latitude = Number(place.lat);
    const longitude = Number(place.lon);
    const title = placeName(place).slice(0, 80);
    if (notes.some((note) => note.title === title && Math.abs(note.lat - latitude) < 1e-5 && Math.abs(note.lng - longitude) < 1e-5)) {
      return "already";
    }
    const now = new Date().toISOString();
    const note = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      lat: latitude,
      lng: longitude,
      title,
      icon: "landmark",
      body: placeNoteBody(place) || title,
      createdAt: now,
      updatedAt: now,
    };
    const nextNotes = [...notes, note];
    try {
      persistNotes(nextNotes);
    } catch (error) {
      console.error("Could not save place.", error);
      return "error";
    }
    notes = nextNotes;
    renderNotes();
    return "saved";
  }

  function wireSaveButton(button, place) {
    button.addEventListener("click", () => {
      const result = savePlace(place);
      button.textContent =
        result === "error" ? "Could not save" : result === "already" ? "Already saved" : "Saved ✓";
      button.disabled = result !== "error";
      nativeApp.haptic(result === "error" ? "error" : "success");
      searchMessage.textContent =
        result === "error"
          ? "Could not save this place. Check this browser's storage settings."
          : `${placeName(place)} is in Saved locations.`;
    });
  }

  function openPointInformationPopup(location, place = null) {
    const lookupId = ++pointLandLookupSequence;
    map.closePopup();
    noteForm.hidden = true;
    const placeMarkup = place
      ? `<h3>${escapeHtml(placeName(place))}</h3>
          <dl class="place-facts">${placeFacts(place)
            .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`)
            .join("")}</dl>
          <p class="place-source">Place details from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors; they may be incomplete or out of date.</p>
          <button type="button" class="note-save-button place-save-button">Save to Saved locations</button>
          <hr class="map-layer-separator" />`
      : "";
    const popup = L.popup({ maxWidth: 320, maxHeight: place ? 380 : 320 })
      .setLatLng(location)
      .setContent(`
        <div class="map-popup">
          <div class="site-popup-header">
            <div class="map-popup-label">${place ? "Search result" : "Selected location"}</div>
            ${popupNoteIconMarkup()}
          </div>
          ${placeMarkup}
          <h3>${place ? "Land at this location" : "Map point"}</h3>
          <p><strong>Coordinates (lat, lon):</strong> ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}</p>
          <p><strong>Mapped land:</strong> <span class="point-land-value">Looking up the land manager…</span></p>
          <p><strong>Contact:</strong> <span class="point-contact-value">Looking up manager information…</span></p>
          <p><strong>Nearest named road (Census):</strong> <span class="nearest-road-value">Looking up nearby named roads…</span></p>
          <p class="popup-warning">Mapped ownership and public-access records do not establish camping permission or current access. Confirm rules, closures, and contact details with the responsible office.</p>
          <p class="popup-warning">Distance is straight-line to the nearest mapped road segment. Census data does not confirm legal public access or current conditions.</p>
        </div>`)
      .openOn(map);
    void queryLandAtPoint(location)
      .then((land) => {
        if (lookupId !== pointLandLookupSequence || !popup.isOpen()) {
          return;
        }
        const popupElement = popup.getElement();
        const landValue = popupElement.querySelector(".point-land-value");
        const contactValue = popupElement.querySelector(".point-contact-value");
        const managerCode = propertyValue(land, "Mang_Name");
        landValue.replaceChildren();
        appendManagerIcon(landValue, managerCode);
        const landDescription = document.createElement("span");
        landDescription.textContent = landTypeDescription(land);
        landValue.append(landDescription);
        const contact = managerContactLink(managerCode);
        contactValue.replaceChildren();
        if (contact) {
          const link = document.createElement("a");
          link.href = contact.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = contact.label;
          contactValue.append(link);
          const note = document.createTextNode(" · Confirm the local office for this site.");
          contactValue.append(note);
        } else {
          contactValue.textContent =
            "The land-boundary record has no office contact. Use the mapped manager name to find the responsible local office.";
        }
      })
      .catch((error) => {
        console.error("Could not look up the land manager at this point.", error);
        if (lookupId === pointLandLookupSequence && popup.isOpen()) {
          popup.getElement().querySelector(".point-land-value").textContent =
            "Land type could not be looked up. Verify with the land manager.";
          popup.getElement().querySelector(".point-contact-value").textContent =
            "Manager contact details could not be looked up.";
        }
      });
    void loadNearestRoadDescription(
      location,
      popup.getElement().querySelector(".nearest-road-value"),
    );
    bindPopupNoteIcon(popup, location);
    const saveButton = popup.getElement().querySelector(".place-save-button");
    if (saveButton && place) {
      wireSaveButton(saveButton, place);
    }
  }

  function managerContactLink(managerCode) {
    const contacts = {
      BLM: {
        label: "BLM field office directory",
        url: "https://www.blm.gov/about/what-we-do/field-office-directory",
      },
      FWS: {
        label: "U.S. Fish and Wildlife Service contacts",
        url: "https://www.fws.gov/about/contact-us",
      },
      NPS: {
        label: "National Park Service contacts",
        url: "https://www.nps.gov/aboutus/contactus.htm",
      },
      USFS: {
        label: "U.S. Forest Service contacts",
        url: "https://www.fs.usda.gov/about-agency/contact-us",
      },
      USACE: {
        label: "U.S. Army Corps of Engineers contacts",
        url: "https://www.usace.army.mil/Contact/",
      },
      USBR: {
        label: "Bureau of Reclamation contacts",
        url: "https://www.usbr.gov/main/offices.html",
      },
    };
    return contacts[managerCode] ?? null;
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

  function formatRoadPopup(
    road,
    land,
    nearestRoad,
    networkRoad,
    location,
    landError,
    nearbyRoadError,
    networkRoadError,
  ) {
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
      nearestMarkup = offlineState.active
        ? "Unavailable offline (needs a data connection)."
        : "Named-road distance could not be looked up.";
    } else if (nearestRoad?.road) {
      nearestMarkup = `${escapeHtml(nearestRoad.road.name)} · ${escapeHtml(
        nearestRoad.road.type,
      )} · ${distanceDescription(nearestRoad.road.distance)} straight-line`;
      if (nearestRoad.incomplete) {
        nearestMarkup += " (nearby road results may be incomplete)";
      }
    } else {
      nearestMarkup = "No named road found within 6.2 mi.";
    }
    const networkMarkup = networkRoadError
      ? offlineState.active
        ? "Unavailable offline (needs a data connection)."
        : "Unavailable (road-network lookup failed)."
      : networkRoad?.road
        ? `${escapeHtml(networkRoad.road.name)} · ${escapeHtml(
            networkRoad.road.type,
          )} · ${distanceDescription(networkRoad.distance)} along mapped roads`
        : `Unavailable (${escapeHtml(networkRoad?.reason || "no reliable connected route was found")})`;
    return `
      <div class="map-popup road-location-popup">
        <div class="site-popup-header">
          <div class="map-popup-label">${escapeHtml(road.definition.label)}</div>
          ${popupNoteIconMarkup()}
        </div>
        <h3>${escapeHtml(name)}</h3>
        <p><strong>Land:</strong> ${escapeHtml(landMarkup)}</p>
        <p><strong>Road type:</strong> ${escapeHtml(roadType)}</p>
        <div class="road-restrictions"><strong>Restrictions and status</strong>${restrictionMarkup}</div>
        <p><strong>Coordinates (lat, lon):</strong> ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}</p>
        <p><strong>Road-network distance to a named Census road:</strong> ${networkMarkup}</p>
        <p><strong>Nearest named road by straight-line distance (Census):</strong> ${nearestMarkup}</p>
        <p class="popup-warning">Road-network distance is calculated only when this selected route closely matches connected Census TIGERweb road geometry. It may identify a different named road than the straight-line result; unavailable means the data could not support a reliable route.</p>
        <p class="popup-warning">Census road data does not confirm legal public access or current conditions.</p>
        <p class="popup-warning">Reference data only. Road records may be incomplete or outdated and do not establish current access or camping permission. Confirm route restrictions, closures, and land rules with the responsible agency.</p>
      </div>`;
  }

  async function handleMapClick(event, fromLandFeature = false) {
    const location = event.latlng;
    if (
      !offlineState.active &&
      settings.overlays.blmRecreation &&
      event.originalEvent?.target?.closest?.(".blm-recreation-site-marker")
    ) {
      void showBlmRecreationDetails(location).then((siteFound) => {
        if (siteFound === false) {
          void handleMapClick({ latlng: location });
        }
      });
      return;
    }
    if (
      !offlineState.active &&
      settings.overlays.fsRecreation &&
      event.originalEvent?.target?.closest?.(".leaflet-usfsRecreationSites-pane")
    ) {
      void showUsfsRecreationDetails(location).then((siteFound) => {
        if (siteFound === false) {
          void handleMapClick({ latlng: location });
        }
      });
      return;
    }
    if (activeRoadOverlays.size === 0) {
      if (clickedMapFeature(event)) {
        return;
      }
      openPointInformationPopup(location);
      return;
    }
    layerStatus.textContent = "";
    const lookupId = ++roadLookupSequence;
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
      if (!fromLandFeature && !clickedMapFeature(event)) {
        openPointInformationPopup(location);
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
    const [landResult, nearbyRoadResult, networkRoadResult] = await Promise.allSettled([
      queryLandAtPoint(location),
      findNearestNamedRoad(location),
      findRoadNetworkDistance(location, closestRoad.geometry),
    ]);
    if (lookupId !== roadLookupSequence) {
      return;
    }
    const landError = landResult.status === "rejected";
    const nearbyRoadError = nearbyRoadResult.status === "rejected";
    const networkRoadError = networkRoadResult.status === "rejected";
    if (landError) {
      console.error("Could not identify land at the selected road location.", landResult.reason);
    }
    if (nearbyRoadError) {
      console.error("Could not find a nearby named public road.", nearbyRoadResult.reason);
    }
    if (networkRoadError) {
      console.error("Could not calculate a road-network distance.", networkRoadResult.reason);
    }
    popup.setContent(
      formatRoadPopup(
        closestRoad,
        landError ? null : landResult.value,
        nearbyRoadError ? null : nearbyRoadResult.value,
        networkRoadError ? null : networkRoadResult.value,
        location,
        landError,
        nearbyRoadError,
        networkRoadError,
      ),
    );
    bindPopupNoteIcon(popup, location);
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
      if (offlineState.active) {
        void renderOfflineData();
        return;
      }
      mapStatus.textContent = "Updating land boundaries…";
      landLayer.setWhere(buildWhere(settings.layers));
    });
    checkbox.addEventListener("change", notifySettingsChange);
  });

  function notifySettingsChange() {
    window.dispatchEvent(new CustomEvent("campgroundless:settingschange"));
  }

  function saveSettings() {
    try {
      window.CampgroundlessSettings.write(settings);
      return true;
    } catch (error) {
      console.error("Could not save map settings.", error);
      return false;
    }
  }

  // Live-apply hooks for the Settings panel, which shares this in-memory settings object.
  window.CampgroundlessMap = Object.freeze({
    getSettings: () => structuredClone(settings),
    isWithinCoverage: (lat, lng) => isWithinCoverage([lng, lat]),
    whenCoverageReady: () => coverageBoundaryPromise.then(() => true, () => false),
    activeBasemapOption,
    setBasemap(option) {
      const radio = document.querySelector(`input[name="map-style-choice"][value="${CSS.escape(option)}"]`);
      if (radio) radio.checked = true;
      applyBasemapOption(option);
    },
    setManagerLayer(name, on) {
      const checkbox = document.querySelector(`input[name="manager"][value="${CSS.escape(name)}"]`);
      if (!checkbox || checkbox.checked === Boolean(on)) return;
      checkbox.checked = Boolean(on);
      checkbox.dispatchEvent(new Event("change"));
    },
    update(patch) {
      Object.assign(settings, patch);
      if ("typography" in patch) window.CampgroundlessSettings.applyTypography(settings);
      if ("theme" in patch) window.CampgroundlessTheme?.apply(settings.theme);
      if ("showLandDisclaimer" in patch || "showBoundaryData" in patch) {
        document.getElementById("land-disclaimer").hidden = settings.showLandDisclaimer === false;
        document.getElementById("boundary-data-notice").hidden = settings.showBoundaryData === false;
        map.invalidateSize();
      }
      if ("recreationSitesMinZoom" in patch) updateRecreationSiteVisibility();
      return saveSettings();
    },
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
    if (!isWithinCoverage([location.lng, location.lat])) {
      return;
    }
    searchMarkers.clearLayers();
    const marker = L.marker(location, { title: placeName(place), alt: `Search result: ${placeName(place)}` })
      .addTo(searchMarkers);
    marker.on("click", () => openPointInformationPopup(location, place));
    map.setView(location, 14);
    openPointInformationPopup(location, place);
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
        isWithinCoverage([location.lng, location.lat]) &&
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
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "search-result-save";
      saveButton.textContent = "Save";
      saveButton.setAttribute("aria-label", `Save ${placeName(place)} to Saved locations`);
      wireSaveButton(saveButton, place);
      item.append(button, saveButton);
      searchResults.append(item);
    });
    searchResults.hidden = validPlaces.length === 0;
    if (validPlaces.length === 0) {
      searchMessage.textContent = "No matching places found in California, Oregon, Washington, Idaho, Nevada, Utah, Arizona, Colorado, New Mexico, or Texas. Try another name or spelling.";
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
    endpoint.searchParams.set("addressdetails", "1");
    endpoint.searchParams.set("extratags", "1");
    endpoint.searchParams.set("countrycodes", "us");
    endpoint.searchParams.set("viewbox", "-124.8,49.1,-93.5,25.8");
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

  const recentKey = "campgroundless.recent-searches.v1";
  const recentList = document.getElementById("recent-list");
  const recentEmpty = document.getElementById("recent-empty");
  const recentClear = document.getElementById("recent-clear");
  const defaultSearchMessage = "";

  function readRecent() {
    try {
      const parsed = JSON.parse(localStorage.getItem(recentKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry?.term === "string") : [];
    } catch {
      return [];
    }
  }

  function renderRecent() {
    const recent = readRecent();
    recentList.replaceChildren();
    recent.forEach((entry) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "list-item";
      const name = document.createElement("strong");
      name.textContent = entry.term;
      const when = document.createElement("small");
      const date = new Date(entry.at);
      when.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
      button.append(name, when);
      button.addEventListener("click", () => {
        searchInput.value = entry.term;
        searchMap();
      });
      item.append(button);
      recentList.append(item);
    });
    recentEmpty.hidden = recent.length > 0;
    recentClear.hidden = recent.length === 0;
  }

  function recordRecent(term) {
    try {
      const next = [
        { term, at: new Date().toISOString() },
        ...readRecent().filter((entry) => entry.term.toLowerCase() !== term.toLowerCase()),
      ].slice(0, 15);
      localStorage.setItem(recentKey, JSON.stringify(next));
    } catch (error) {
      console.error("Could not save recent search.", error);
    }
    renderRecent();
  }

  recentClear.addEventListener("click", () => {
    try {
      localStorage.removeItem(recentKey);
    } catch (error) {
      console.error("Could not clear recent searches.", error);
    }
    renderRecent();
  });
  renderRecent();

  async function searchMap() {
    const term = searchInput.value.trim();
    if (!term) {
      searchMessage.textContent = "Enter a place, landmark, business, or land-unit name.";
      return;
    }
    if (placeSearchInProgress) {
      return;
    }
    recordRecent(term);
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
    searchMessage.textContent = "Searching California, Oregon, Washington, Idaho, Nevada, Utah, Arizona, Colorado, New Mexico, and Texas…";
    try {
      await searchPlaces(term);
    } catch (error) {
      console.error("Place search failed.", error);
      searchMessage.textContent = offlineState.active
        ? "Place search needs a data connection. Offline, you can search land-unit names in your saved areas."
        : error.name === "AbortError"
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

  searchInput.addEventListener("input", () => {
    if (!searchInput.value.trim()) {
      clearSearchResults();
      searchMessage.textContent = defaultSearchMessage;
    }
  });

  map.on("popupclose", () => {
    setTimeout(() => {
      if (!(map._popup && map.hasLayer(map._popup)) && searchMarkers.getLayers().length) {
        clearSearchResults();
        searchMessage.textContent = defaultSearchMessage;
      }
    }, 0);
  });

  document.getElementById("locate-button").addEventListener("click", () => {
    // GPS still works without a data connection; Wi-Fi/cell positioning may not.
    map.locate({ setView: true, maxZoom: offlineState.active ? 14 : 10, enableHighAccuracy: offlineState.active });
  });

  let locationMarker = null;
  map.on("locationfound", (event) => {
    nativeApp.haptic("light");
    if (locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(event.latlng, {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: "#315a43",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindPopup(nativeApp.isNative ? "Your location (only visible on this device)" : "Your location (only visible in this browser)");
  });

  map.on("locationerror", () => {
    searchMessage.textContent = nativeApp.isNative
      ? "Location access was unavailable. Allow location for Campgroundless in iPhone Settings and try again."
      : "Location access was unavailable. Check your browser permission and try again.";
  });

  document.getElementById("reset-button").addEventListener("click", () => {
    map.fitBounds(coverageBounds);
    searchInput.value = "";
    clearSearchResults();
    searchMessage.textContent = defaultSearchMessage;
  });

  // ---- Offline areas: save a map area on this device and use it with no signal.
  const offlineApi = window.CampgroundlessOffline;
  // Downloads are limited by this device's free storage rather than a fixed size.
  const offlineStorageShare = 0.8;
  const offlineUnknownStorageLimit = 2 * 1024 ** 3;
  const offlineLargeDownloadBytes = 500 * 1024 ** 2;
  const offlineVectorCheckpointParts = 10;
  // Large areas download in parts so each data query and tile batch stays small.
  const offlinePartTiles = 5000;
  const offlinePartDegrees = 0.5;
  const offlineBasemapMinZoom = 8;
  const offlineOverlayMinZoom = 11;
  const offlineOverlayMaxZoom = 14;
  const offlineFeatureCap = 40000;
  const offlinePrefsKey = "campgroundless.offline.prefs";
  const offlineDetailLevels = [
    [13, "Overview"],
    [14, "Roads & trails"],
    [15, "Detailed"],
    [16, "Maximum"],
  ];
  const offlineView = document.getElementById("view-offline");
  const offlineForm = document.getElementById("offline-download-form");
  const offlineName = document.getElementById("offline-name");
  const offlineBasemapChoices = document.getElementById("offline-basemaps");
  const offlineDetail = document.getElementById("offline-detail");
  const offlineLayerChoices = document.getElementById("offline-layers");
  const offlineEstimate = document.getElementById("offline-estimate");
  const offlineDownloadButton = document.getElementById("offline-download");
  const offlineCancelButton = document.getElementById("offline-cancel");
  const offlineProgress = document.getElementById("offline-progress");
  const offlineMessage = document.getElementById("offline-message");
  const offlinePackList = document.getElementById("offline-pack-list");
  const offlineEmpty = document.getElementById("offline-empty");
  const offlineStorage = document.getElementById("offline-storage");
  const offlineToggle = document.getElementById("offline-mode-toggle");
  const offlineModeText = document.getElementById("offline-mode-text");
  Object.assign(offlineState, {
    reason: "",
    dataCache: new Map(),
    baseLayers: [],
    landLayer: null,
    outlines: null,
    checking: false,
    probeTimer: null,
    download: null,
    renderSequence: 0,
    overlaySequence: 0,
  });
  let offlineLandRenderer;
  let offlineRoadRenderer;

  class OfflineUnavailableError extends Error {
    constructor() {
      super("This lookup needs a data connection.");
      this.name = "OfflineUnavailableError";
    }
  }

  function readOfflinePrefs() {
    try {
      return JSON.parse(localStorage.getItem(offlinePrefsKey) || "{}") || {};
    } catch {
      return {};
    }
  }

  function writeOfflinePrefs(prefs) {
    try {
      localStorage.setItem(offlinePrefsKey, JSON.stringify(prefs));
    } catch {}
  }

  function packLatLngBounds(pack) {
    return L.latLngBounds(
      [pack.bounds.south, pack.bounds.west],
      [pack.bounds.north, pack.bounds.east],
    );
  }

  function unionPackBounds(packs) {
    return packs.reduce(
      (bounds, pack) => bounds.extend(packLatLngBounds(pack)),
      packLatLngBounds(packs[0]),
    );
  }

  function currentDownloadBounds() {
    const bounds = map.getBounds();
    return {
      west: Math.max(-180, bounds.getWest()),
      south: Math.max(-85, bounds.getSouth()),
      east: Math.min(180, bounds.getEast()),
      north: Math.min(85, bounds.getNorth()),
    };
  }

  function formatPackDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "an unknown date"
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function isRasterOverlay(definition) {
    return Boolean(definition) && definition.type !== "feature" && definition.type !== "blm-sites";
  }

  function overlayExportUrl(definition) {
    return (tile) => {
      const bbox = offlineApi.tileMercatorBounds(tile).join(",");
      // 512px at 192 dpi keeps lines and labels sharp on high-density screens.
      return `${definition.url}/export?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=512,512&dpi=192&format=png32&transparent=true&layers=show:${definition.layers.join(",")}&f=image`;
    };
  }

  function offlineTilePlan({ bounds, maxZoom, basemap, layers }) {
    const base = offlineApi.basemaps[basemap] ?? offlineApi.basemaps["usgs-topo"];
    const vector = base.kind === "vector";
    const jobs = [
      {
        layer: `basemap:${basemap}`,
        minZoom: offlineBasemapMinZoom,
        maxZoom: Math.min(maxZoom, base.maxNativeZoom),
        averageBytes: base.averageTileBytes,
        vector,
        concurrency: base.concurrency,
        urlFor: vector
          ? (tile) => offlineApi.vector.tileUrl(tile)
          : ({ z, x, y }) => base.url.replace("{z}", z).replace("{y}", y).replace("{x}", x),
      },
    ];
    layers.forEach((key) => {
      const definition = overlayDefinitionsByKey[key];
      if (isRasterOverlay(definition)) {
        jobs.push({
          layer: `overlay:${key}`,
          minZoom: offlineOverlayMinZoom,
          maxZoom: Math.min(maxZoom, offlineOverlayMaxZoom),
          averageBytes: 14000,
          urlFor: overlayExportUrl(definition),
        });
      }
    });
    jobs.forEach((job) => {
      job.count = offlineApi.countTiles(bounds, job.minZoom, job.maxZoom);
    });
    return {
      jobs,
      tileCount: jobs.reduce((sum, job) => sum + job.count, 0),
      bytes: jobs.reduce((sum, job) => sum + job.count * job.averageBytes, 0),
      // OpenFreeMap counts every request (tiles, style, fonts, icons) per download.
      providerRequests: vector ? jobs[0].count + offlineApi.vector.assetRequests() : 0,
      providerLimit: vector ? base.maxRequests : Infinity,
    };
  }

  function splitOfflineBounds(options) {
    const { bounds } = options;
    const tileCount = offlineTilePlan(options).tileCount;
    const parts = Math.max(1, Math.ceil(tileCount / offlinePartTiles));
    const middleLatitude = (bounds.north + bounds.south) / 2;
    const lonSpan = bounds.east - bounds.west;
    const latSpan = bounds.north - bounds.south;
    const aspect = Math.max(0.05, (lonSpan * Math.cos((middleLatitude * Math.PI) / 180)) / Math.max(latSpan, 1e-6));
    let columns = Math.max(1, Math.round(Math.sqrt(parts * aspect)));
    let rows = Math.max(1, Math.ceil(parts / columns));
    columns = Math.max(columns, Math.ceil(lonSpan / offlinePartDegrees));
    rows = Math.max(rows, Math.ceil(latSpan / offlinePartDegrees));
    const grow = () => {
      if (lonSpan / columns >= latSpan / rows) columns += 1;
      else rows += 1;
    };
    const cell = (row, column) => ({
      west: bounds.west + (lonSpan * column) / columns,
      east: bounds.west + (lonSpan * (column + 1)) / columns,
      south: bounds.north - (latSpan * (row + 1)) / rows,
      north: bounds.north - (latSpan * row) / rows,
    });
    while (offlineTilePlan({ ...options, bounds: cell(0, 0) }).tileCount > offlinePartTiles && columns * rows < 400) {
      grow();
    }
    const chunks = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        chunks.push(cell(row, column));
      }
    }
    return chunks;
  }

  function offlineFeatureKey(feature) {
    const id = feature.id ?? feature.properties?.OBJECTID ?? feature.properties?.FID ?? feature.properties?.objectid;
    return id === undefined || id === null ? null : `${feature.layerId ?? ""}:${id}`;
  }

  function offlineVectorJobs(layers) {
    const jobs = [
      {
        data: "land",
        label: "Land boundaries",
        url: dataSourceUrl,
        where: buildWhere({ forest: true, blm: true, state: true, other: true }),
        outFields: landLayerOptions.fields.join(","),
        token: settings.dataApiKey || undefined,
      },
    ];
    layers.forEach((key) => {
      const definition = overlayDefinitionsByKey[key];
      if (!definition) {
        return;
      }
      if (definition.type === "feature") {
        jobs.push({ data: `roads:${key}`, label: definition.label, url: definition.url, where: definition.where });
      } else if (definition.type === "blm-sites") {
        jobs.push({
          data: "sites:blmRecreation",
          label: definition.label,
          url: definition.url,
          where: definition.where,
          outFields: definition.fields.join(","),
          points: true,
        });
      } else if (definition.isRoad) {
        // Saved so road clicks can show route details without a connection.
        definition.layers.forEach((layerId) =>
          jobs.push({
            data: `roads:${key}`,
            layerId,
            label: definition.label,
            url: `${definition.url}/${layerId}`,
            where: "1=1",
          }),
        );
      }
    });
    return jobs;
  }

  async function fetchOfflineJson(url, signal) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`Map data request failed (${response.status}).`);
        }
        const data = await response.json();
        if (data.error) {
          throw new Error(data.error.message || "Map data provider returned an error.");
        }
        return data;
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  async function queryAreaFeatures(job, bounds, signal) {
    const features = [];
    for (;;) {
      const parameters = new URLSearchParams({
        where: job.where ?? "1=1",
        geometry: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
        geometryType: "esriGeometryEnvelope",
        spatialRel: "esriSpatialRelIntersects",
        inSR: "4326",
        outSR: "4326",
        outFields: job.outFields ?? "*",
        returnGeometry: "true",
        geometryPrecision: "6",
        resultOffset: String(features.length),
        resultRecordCount: "1000",
        f: "geojson",
      });
      if (!job.points) {
        parameters.set("maxAllowableOffset", "0.00005");
      }
      if (job.token) {
        parameters.set("token", job.token);
      }
      const data = await fetchOfflineJson(
        `${job.url.replace(/\/+$/, "")}/query?${parameters}`,
        signal,
      );
      const page = Array.isArray(data.features) ? data.features : [];
      page.forEach((feature) => {
        if (job.layerId !== undefined) {
          feature.layerId = job.layerId;
        }
        features.push(feature);
      });
      if (features.length > offlineFeatureCap) {
        throw new Error(`${job.label} has too many features here. Zoom in and save a smaller area.`);
      }
      const more = data.exceededTransferLimit || data.properties?.exceededTransferLimit;
      if (!more || page.length === 0) {
        return features;
      }
    }
  }

  function setOfflineMessage(text, isError = false) {
    offlineMessage.textContent = text;
    offlineMessage.classList.toggle("is-error", isError);
  }

  function setDownloadInProgress(active) {
    offlineDownloadButton.disabled = active;
    offlineCancelButton.hidden = !active;
    offlineProgress.hidden = !active;
    offlineForm.querySelectorAll("input, select").forEach((input) => {
      input.disabled = active || input.dataset.locked === "true";
    });
    offlinePackList.querySelectorAll("button[data-pack-action='download']").forEach((button) => {
      button.disabled = active;
    });
  }

  // Icons and logos are fetched once while online so the service worker keeps them,
  // and the Forest Service site symbols are saved on this device.
  function warmOfflineAssets() {
    const urls = Object.values(blmRecreationTypes)
      .filter((type) => type.npsIcon)
      .map((type) => `icons/nps/${type.npsIcon}.svg`);
    [...urls, ...Object.values(managerLogos)].forEach((url) => fetch(url).catch(() => {}));
    usfsSymbolRendererInfos();
  }

  async function downloadOfflinePack({ id, name, bounds, maxZoom, basemap, layers, refresh = false }) {
    if (offlineState.download) {
      return;
    }
    const controller = new AbortController();
    offlineState.download = controller;
    setDownloadInProgress(true);
    const plan = offlineTilePlan({ bounds, maxZoom, basemap, layers });
    const isNew = !id;
    const pack = {
      id: id ?? `area-${Date.now().toString(36)}`,
      name,
      bounds,
      maxZoom,
      basemap,
      layers,
      createdAt: new Date().toISOString(),
      tileLayers: Object.fromEntries(
        plan.jobs.map((job) => [job.layer, { minZoom: job.minZoom, maxZoom: job.maxZoom }]),
      ),
      featureCounts: {},
      bytes: 0,
      complete: false,
    };
    const chunks = splitOfflineBounds({ bounds, maxZoom, basemap, layers });
    pack.parts = chunks.length;
    let saved = false;
    try {
      void offlineApi.requestPersistence();
      const vectorJobs = offlineVectorJobs(layers);
      const collected = {};
      const featureKeys = {};
      const seenTiles = new Set();
      let done = 0;
      let tileBytes = 0;
      let dataBytes = 0;
      offlineProgress.max = Math.max(1, plan.tileCount);
      offlineProgress.value = 0;
      let providerBytes = 0;
      const vectorBase = offlineApi.basemaps[basemap]?.kind === "vector" ? offlineApi.basemaps[basemap] : null;
      const countProviderBytes = (size) => {
        providerBytes += size;
        if (providerBytes > vectorBase.maxBytes) {
          throw new Error(
            `this area needs more than OpenFreeMap's ${offlineApi.formatBytes(vectorBase.maxBytes)} per-download limit. Zoom in or choose a lower detail level.`,
          );
        }
      };
      if (vectorBase) {
        if (plan.providerRequests > plan.providerLimit) {
          throw new Error("this area needs more than OpenFreeMap's 3,000-tile per-download limit.");
        }
        setOfflineMessage("Saving the OpenFreeMap style, fonts and icons…");
        await offlineApi.vector.prepare({ signal: controller.signal, onBytes: countProviderBytes });
      }
      for (const [index, chunk] of chunks.entries()) {
        const step = (text) =>
          chunks.length > 1
            ? `Part ${index + 1} of ${chunks.length}: ${text}`
            : `${text[0].toUpperCase()}${text.slice(1)}`;
        for (const job of vectorJobs) {
          setOfflineMessage(step(`saving ${job.label.replace(/^[A-Z](?=[a-z])/, (letter) => letter.toLowerCase())}…`));
          const features = await queryAreaFeatures(job, chunk, controller.signal);
          const list = (collected[job.data] ??= []);
          const keys = (featureKeys[job.data] ??= new Set());
          features.forEach((feature) => {
            const key = offlineFeatureKey(feature);
            if (key === null || !keys.has(key)) {
              if (key !== null) keys.add(key);
              list.push(feature);
            }
          });
        }
        // Rewriting all saved records after every part is slow for very large areas.
        const lastPart = index === chunks.length - 1;
        if (index === 0 || lastPart || index % offlineVectorCheckpointParts === 0) {
          dataBytes = 0;
          for (const job of vectorJobs) {
            const features = collected[job.data] ?? [];
            if (pack.featureCounts[job.data] !== features.length || index === 0) {
              await offlineApi.putData(pack.id, job.data, features);
              pack.featureCounts[job.data] = features.length;
            }
          }
          Object.values(collected).forEach((features) => {
            dataBytes += JSON.stringify(features).length;
          });
          pack.dataBytes = dataBytes;
        }
        pack.partsDone = index;
        await offlineApi.savePack(pack);
        saved = true;
        offlineState.dataCache.clear();
        if (index === 0) {
          warmOfflineAssets();
        }

        for (const job of plan.jobs) {
          tileBytes += await offlineApi.downloadTiles({
            layer: job.layer,
            urlFor: job.urlFor,
            bounds: chunk,
            minZoom: job.minZoom,
            maxZoom: job.maxZoom,
            signal: controller.signal,
            refresh,
            seen: seenTiles,
            vector: job.vector,
            concurrency: job.concurrency ?? 4,
            onBytes: job.vector ? countProviderBytes : undefined,
            onTile: () => {
              done += 1;
              if (done % 8 === 0 || done === plan.tileCount) {
                offlineProgress.value = Math.min(done, plan.tileCount);
                setOfflineMessage(
                  step(`saving map images… ${Math.min(done, plan.tileCount).toLocaleString()} of ${plan.tileCount.toLocaleString()}`),
                );
              }
            },
          });
        }
        pack.partsDone = index + 1;
        pack.bytes = tileBytes + dataBytes;
        await offlineApi.savePack(pack);
      }
      pack.bytes = tileBytes + dataBytes;
      pack.complete = true;
      pack.createdAt = new Date().toISOString();
      await offlineApi.savePack(pack);
      setOfflineMessage(
        `Saved “${name}” (${offlineApi.formatBytes(pack.bytes)}). It will open automatically when you have no signal.`,
      );
      nativeApp.haptic("success");
    } catch (error) {
      if (error.name === "AbortError") {
        if (isNew) {
          await offlineApi.deletePack(pack).catch(() => {});
          saved = false;
        }
        setOfflineMessage("Download canceled.");
      } else {
        console.error("Could not save the offline area.", error);
        if (isNew && !saved) {
          await offlineApi.deletePack(pack).catch(() => {});
        }
        setOfflineMessage(
          `Download stopped: ${error.message}${saved ? " Progress was kept; choose Resume to finish." : ""}`,
          true,
        );
        nativeApp.haptic("error");
      }
    } finally {
      offlineState.download = null;
      offlineState.dataCache.clear();
      setDownloadInProgress(false);
      await renderOfflinePackList();
      updateOfflineEstimate();
      if (offlineState.active) {
        await loadOfflinePacks();
        await rebuildOfflineLayers();
      }
    }
  }

  async function loadOfflinePacks() {
    offlineState.packs = offlineApi?.supported
      ? await offlineApi.listPacks().catch(() => [])
      : [];
    return offlineState.packs;
  }

  function packData(pack, key) {
    const cacheKey = `${pack.id}:${key}`;
    if (!offlineState.dataCache.has(cacheKey)) {
      offlineState.dataCache.set(
        cacheKey,
        offlineApi.getData(pack.id, key).then((value) => value ?? []).catch(() => []),
      );
    }
    return offlineState.dataCache.get(cacheKey);
  }

  // Overlapping areas save the same features; keep one copy of each.
  async function combinedPackData(key) {
    const seen = new Set();
    const features = [];
    for (const pack of offlineState.packs) {
      for (const feature of await packData(pack, key)) {
        const featureId =
          feature.id ?? feature.properties?.OBJECTID ?? feature.properties?.FID;
        if (featureId !== undefined && featureId !== null) {
          const dedupeKey = `${feature.layerId ?? ""}:${featureId}`;
          if (seen.has(dedupeKey)) {
            continue;
          }
          seen.add(dedupeKey);
        }
        features.push(feature);
      }
    }
    return features;
  }

  const featureBoxes = new WeakMap();
  function featureBox(feature) {
    let box = featureBoxes.get(feature);
    if (!box) {
      box = { xmin: Infinity, ymin: Infinity, xmax: -Infinity, ymax: -Infinity };
      const visit = (coordinates) => {
        if (typeof coordinates[0] === "number") {
          box.xmin = Math.min(box.xmin, coordinates[0]);
          box.xmax = Math.max(box.xmax, coordinates[0]);
          box.ymin = Math.min(box.ymin, coordinates[1]);
          box.ymax = Math.max(box.ymax, coordinates[1]);
        } else {
          coordinates.forEach(visit);
        }
      };
      if (Array.isArray(feature.geometry?.coordinates)) {
        visit(feature.geometry.coordinates);
      }
      featureBoxes.set(feature, box);
    }
    return box;
  }

  function insideSavedArea(location, dataKey) {
    return offlineState.packs.some(
      (pack) =>
        (!dataKey || pack.featureCounts?.[dataKey] !== undefined) &&
        packLatLngBounds(pack).contains(location),
    );
  }

  async function offlineLandAtPoint(location) {
    if (!insideSavedArea(location, "land")) {
      throw new OfflineUnavailableError();
    }
    const point = [location.lng, location.lat];
    const match = (await combinedPackData("land")).find((feature) => {
      const box = featureBox(feature);
      return (
        point[0] >= box.xmin && point[0] <= box.xmax &&
        point[1] >= box.ymin && point[1] <= box.ymax &&
        pointInStateBoundary(point, feature.geometry)
      );
    });
    return match?.properties ?? null;
  }

  async function offlineRoadsNear(definition, location, toleranceMeters) {
    const key = `roads:${definition.key}`;
    if (!insideSavedArea(location, key)) {
      throw new OfflineUnavailableError();
    }
    const envelope = roadQueryEnvelope(location, toleranceMeters);
    return (await combinedPackData(key))
      .filter((feature) => {
        const box = featureBox(feature);
        return (
          box.xmax >= envelope.xmin && box.xmin <= envelope.xmax &&
          box.ymax >= envelope.ymin && box.ymin <= envelope.ymax
        );
      })
      .map((feature) => ({
        definition,
        layerId: feature.layerId ?? null,
        properties: feature.properties ?? {},
        geometry: feature.geometry,
      }));
  }

  async function renderOfflineData() {
    const sequence = ++offlineState.renderSequence;
    const features = await combinedPackData("land");
    if (!offlineState.active || sequence !== offlineState.renderSequence) {
      return;
    }
    const managers = new Set(
      Object.keys(managersByGroup)
        .filter((group) => settings.layers[group])
        .flatMap((group) => managersByGroup[group]),
    );
    if (offlineState.landLayer) {
      map.removeLayer(offlineState.landLayer);
    }
    offlineLandRenderer ??= L.canvas({ padding: 0.3 });
    offlineState.landLayer = L.geoJSON(
      {
        type: "FeatureCollection",
        features: features.filter((feature) => managers.has(feature.properties?.Mang_Name)),
      },
      {
        renderer: offlineLandRenderer,
        style: featureStyle,
        onEachFeature: createPopup,
        attribution: `${landLayerOptions.attribution} (saved offline)`,
      },
    );
    offlineState.landLayer.on("click", handleLandFeatureClick);
    offlineState.landLayer.addTo(map);
  }

  async function buildOfflineOverlay(key, definition) {
    if (definition.type === "feature") {
      const features = await combinedPackData(`roads:${key}`);
      if (!features.length) {
        return null;
      }
      offlineRoadRenderer ??= L.canvas({ pane: "referenceOverlays", padding: 0.3 });
      return L.geoJSON({ type: "FeatureCollection", features }, {
        pane: "referenceOverlays",
        renderer: offlineRoadRenderer,
        interactive: false,
        attribution: definition.attribution,
        style: () => ({
          color: definition.color,
          weight: 2,
          opacity: 0.9,
          dashArray: definition.dashArray,
        }),
      });
    }
    if (definition.type === "blm-sites") {
      const features = (await combinedPackData("sites:blmRecreation")).filter(
        (feature) => feature.geometry?.type === "Point",
      );
      return features.length ? buildBlmRecreationLayer(features, definition) : null;
    }
    const tileLayer = `overlay:${key}`;
    const packs = offlineState.packs.filter((pack) => pack.tileLayers?.[tileLayer]);
    if (!packs.length) {
      return null;
    }
    return offlineApi.createCachedTileLayer(tileLayer, {
      pane: definition.isRecreation ? "usfsRecreationSites" : "referenceOverlays",
      opacity: 0.88,
      minZoom: offlineOverlayMinZoom,
      maxZoom: 19,
      bounds: unionPackBounds(packs),
      attribution: definition.attribution,
    });
  }

  async function syncOfflineOverlays() {
    if (!offlineState.active) {
      return;
    }
    const sequence = ++offlineState.overlaySequence;
    const missing = [];
    for (const [key, definition] of Object.entries(overlayDefinitionsByKey)) {
      const existing = offlineState.overlayLayers.get(key);
      if (!settings.overlays[key]) {
        if (existing) {
          map.removeLayer(existing);
        }
        continue;
      }
      if (existing) {
        existing.addTo(map);
        continue;
      }
      const layer = await buildOfflineOverlay(key, definition);
      if (sequence !== offlineState.overlaySequence || !offlineState.active) {
        return;
      }
      if (layer) {
        offlineState.overlayLayers.set(key, layer);
        layer.addTo(map);
      } else {
        missing.push(definition.label);
      }
    }
    if (layerStatus && missing.length) {
      layerStatus.textContent = `Not saved in your offline areas: ${missing.join(", ")}.`;
    }
  }

  function removeOfflineLayers() {
    offlineState.baseLayers.forEach((layer) => map.removeLayer(layer));
    offlineState.baseLayers = [];
    offlineState.overlayLayers.forEach((layer) => map.removeLayer(layer));
    offlineState.overlayLayers.clear();
    if (offlineState.landLayer) {
      map.removeLayer(offlineState.landLayer);
      offlineState.landLayer = null;
    }
    if (offlineState.outlines) {
      map.removeLayer(offlineState.outlines);
      offlineState.outlines = null;
    }
  }

  async function rebuildOfflineLayers() {
    removeOfflineLayers();
    if (!offlineState.packs.length) {
      exitOfflineMode("No offline areas remain · showing the live map");
      return;
    }
    const packsByBasemap = new Map();
    offlineState.packs.forEach((pack) => {
      const list = packsByBasemap.get(pack.basemap) ?? [];
      list.push(pack);
      packsByBasemap.set(pack.basemap, list);
    });
    for (const [basemap, packs] of packsByBasemap) {
      const definition = offlineApi.basemaps[basemap];
      const layer =
        definition?.kind === "vector"
          ? await offlineApi.vector.createLayer({ attribution: definition.attribution }).catch((error) => {
              console.warn("Could not open the saved vector map.", error);
              return null;
            })
          : offlineApi.createCachedTileLayer(`basemap:${basemap}`, {
              maxZoom: 19,
              bounds: unionPackBounds(packs),
              attribution: definition?.attribution ?? "Saved basemap",
            });
      if (!layer || !offlineState.active) {
        continue;
      }
      layer.addTo(map);
      layer.bringToBack?.();
      offlineState.baseLayers.push(layer);
    }
    offlineState.outlines = L.layerGroup(
      offlineState.packs.map((pack) =>
        L.rectangle(packLatLngBounds(pack), {
          className: "offline-area-outline",
          color: "#315a43",
          weight: 2,
          dashArray: "6 6",
          fill: false,
          interactive: false,
        }),
      ),
    ).addTo(map);
    await renderOfflineData();
    await syncOfflineOverlays();
    updateOfflineStatus();
  }

  function updateOfflineStatus() {
    if (!offlineState.active || !offlineState.packs.length) {
      return;
    }
    const oldest = offlineState.packs.reduce((first, pack) =>
      String(pack.createdAt) < String(first.createdAt) ? pack : first,
    );
    const stale = offlineApi.packAgeDays(oldest) >= offlineApi.staleDays;
    const inside = offlineState.packs.some((pack) =>
      packLatLngBounds(pack).contains(map.getCenter()),
    );
    let text = `Offline · showing maps saved ${formatPackDate(oldest.createdAt)}`;
    if (stale) {
      text += ` · over ${offlineApi.staleDays} days old`;
    }
    if (!inside) {
      text += " · this view is outside your saved areas";
    }
    mapLoading.hidden = true;
    mapStatus.textContent = text;
    mapStatus.classList.add("is-offline");
    mapStatus.classList.toggle("error", stale || !inside);
  }

  async function enterOfflineMode(reason) {
    if (!offlineApi?.supported) {
      return false;
    }
    await loadOfflinePacks();
    if (!offlineState.packs.length) {
      if (reason === "auto") {
        mapLoading.hidden = true;
        mapStatus.textContent = "No connection · no offline areas are saved on this device";
        mapStatus.classList.add("error");
      }
      return false;
    }
    if (offlineState.active) {
      if (reason === "manual") {
        offlineState.reason = "manual";
      }
      updateOfflineToggle();
      return true;
    }
    offlineState.active = true;
    offlineState.reason = reason;
    map.closePopup();
    map.removeLayer(basemapLayer);
    map.getContainer().dataset.basemap = "offline";
    map.removeLayer(landLayer);
    Object.values(liveOverlayLayers).forEach((layer) => {
      if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
    updateRecreationSiteVisibility();
    await rebuildOfflineLayers();
    updateOfflineToggle();
    if (reason === "auto") {
      startConnectionProbe();
    }
    return true;
  }

  function exitOfflineMode(message) {
    if (!offlineState.active) {
      return;
    }
    offlineState.active = false;
    offlineState.reason = "";
    stopConnectionProbe();
    map.closePopup();
    removeOfflineLayers();
    basemapLayer = createBasemap().addTo(map);
    basemapLayer.bringToBack?.();
    landLayer.addTo(map);
    const where = buildWhere(settings.layers);
    if (landLayer.options.where !== where) {
      landLayer.setWhere(where);
    }
    document.querySelectorAll('input[name="map-reference-overlay"]').forEach((checkbox) => {
      if (checkbox.checked) {
        checkbox.dispatchEvent(new Event("change"));
      }
    });
    mapStatus.classList.remove("is-offline", "error");
    mapStatus.textContent = message ?? "Back online · loading live map data…";
    updateOfflineToggle();
  }

  async function probeConnection() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${dataSourceUrl.replace(/\/+$/, "")}?f=json`, {
        signal: controller.signal,
        cache: "no-store",
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  // A weak signal often leaves requests hanging instead of failing outright.
  async function checkConnectivityAfterFailure() {
    if (offlineState.active || offlineState.checking || !offlineApi?.supported) {
      return;
    }
    offlineState.checking = true;
    try {
      const packs = await loadOfflinePacks();
      if (packs.length && !(await probeConnection())) {
        await enterOfflineMode("auto");
      }
    } finally {
      offlineState.checking = false;
    }
  }

  function startConnectionProbe() {
    stopConnectionProbe();
    offlineState.probeTimer = setInterval(async () => {
      if (offlineState.reason !== "auto" || navigator.onLine === false) {
        return;
      }
      if (await probeConnection()) {
        exitOfflineMode("Back online · showing live map data");
      }
    }, 45000);
  }

  function stopConnectionProbe() {
    clearInterval(offlineState.probeTimer);
    offlineState.probeTimer = null;
  }

  function updateOfflineToggle() {
    if (!offlineToggle) {
      return;
    }
    offlineToggle.checked = offlineState.active;
    offlineModeText.textContent = offlineState.active
      ? offlineState.reason === "auto"
        ? "On automatically: no data connection was detected. Live map data returns when the connection does."
        : "On: the map shows only your saved areas, even when a connection is available."
      : "Off: the live map is shown. Saved areas open automatically when there is no signal.";
  }

  function areaDimensions(bounds) {
    const middleLatitude = (bounds.north + bounds.south) / 2;
    const width = map.distance([middleLatitude, bounds.west], [middleLatitude, bounds.east]);
    const height = map.distance([bounds.south, bounds.west], [bounds.north, bounds.west]);
    return `${Math.max(1, Math.round(width / 1000))} × ${Math.max(1, Math.round(height / 1000))} km`;
  }

  function selectedOfflineOptions() {
    return {
      bounds: currentDownloadBounds(),
      maxZoom: Number(offlineDetail.value),
      basemap:
        offlineBasemapChoices.querySelector("input:checked")?.value ?? "usgs-topo",
      layers: [...offlineLayerChoices.querySelectorAll("input[data-overlay]:checked")].map(
        (input) => input.value,
      ),
    };
  }

  function updateOfflineEstimate() {
    if (!offlineApi?.supported || offlineState.download || offlineView.hidden) {
      return;
    }
    const options = selectedOfflineOptions();
    const limit = offlineDownloadLimit();
    let bestAllowed = null;
    [...offlineDetail.options].forEach((option) => {
      const plan = offlineTilePlan({ ...options, maxZoom: Number(option.value) });
      const overProvider = plan.providerRequests > plan.providerLimit;
      const allowed = plan.bytes <= limit && !overProvider;
      option.disabled = !allowed;
      option.textContent = `${option.dataset.label} (zoom ${option.value}) · ~${offlineApi.formatBytes(plan.bytes)}${allowed ? "" : overProvider ? " · over OpenFreeMap limit" : " · not enough space"}`;
      if (allowed) {
        bestAllowed = option;
      }
    });
    if (offlineDetail.selectedOptions[0]?.disabled && bestAllowed) {
      offlineDetail.value = bestAllowed.value;
    }
    const plan = offlineTilePlan(selectedOfflineOptions());
    const overProvider = plan.providerRequests > plan.providerLimit;
    const tooLarge = plan.bytes > limit || overProvider;
    offlineDownloadButton.disabled = tooLarge;
    offlineEstimate.classList.toggle("is-error", tooLarge);
    offlineEstimate.textContent = overProvider
      ? `OpenFreeMap allows ${plan.providerLimit.toLocaleString()} tiles per download; this view (${areaDimensions(options.bounds)}) needs about ${plan.providerRequests.toLocaleString()}. Zoom the map in or choose a lower detail level.`
      : tooLarge
      ? `This view (${areaDimensions(options.bounds)}) needs about ${offlineApi.formatBytes(plan.bytes)}, more than the ${offlineApi.formatBytes(limit)} this device can spare for saved maps. Zoom the map in or delete other saved areas.`
      : `Saves the visible map area (${areaDimensions(options.bounds)}): about ${offlineApi.formatBytes(plan.bytes)} of map images plus land and road data.${partsNote(options, plan)}${plan.bytes > offlineLargeDownloadBytes ? ` Estimated time on fast Wi-Fi: ${formatDownloadTime(plan)}.` : ""}`;
    if (!offlineName.value) {
      const center = map.getCenter();
      offlineName.placeholder = `Area near ${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`;
    }
  }

  function offlineDownloadLimit() {
    const { usage, quota } = offlineState.storage ?? {};
    if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) {
      return offlineUnknownStorageLimit;
    }
    return Math.max(0, quota - usage) * offlineStorageShare;
  }

  async function refreshOfflineStorage() {
    offlineState.storage = await offlineApi.storageSummary().catch(() => ({}));
    updateOfflineEstimate();
    return offlineState.storage;
  }

  // Rough rates measured on a fast connection: basemap tiles are quick, while
  // overlay images are drawn on demand by the agency servers.
  function formatDownloadTime(plan) {
    const seconds = plan.jobs.reduce(
      (sum, job) => sum + job.count / (job.layer.startsWith("basemap:") ? 40 : 3),
      0,
    );
    const minutes = Math.max(1, Math.round(seconds / 60));
    return minutes < 90 ? `about ${minutes} min` : `about ${Math.round(minutes / 6) / 10} hours`;
  }

  function partsNote(options, plan) {
    if (plan.tileCount <= offlinePartTiles) {
      return "";
    }
    const parts = splitOfflineBounds(options).length;
    return ` Large area: it downloads in ${parts} parts as one saved area. Stay on Wi-Fi with the app open; if it stops, choose Resume.`;
  }

  function describePackLayers(pack) {
    const labels = ["Land boundaries"];
    pack.layers.forEach((key) => {
      const label = overlayDefinitionsByKey[key]?.label;
      if (label) {
        labels.push(label);
      }
    });
    return labels.join(", ");
  }

  function packListItem(pack) {
    const item = document.createElement("li");
    item.className = "offline-pack";
    const head = document.createElement("div");
    head.className = "offline-pack-head";
    const name = document.createElement("strong");
    name.textContent = pack.name;
    head.append(name);
    const stale = offlineApi.packAgeDays(pack) >= offlineApi.staleDays;
    if (pack.complete === false || stale) {
      const badge = document.createElement("span");
      badge.className = "offline-badge";
      badge.textContent = pack.complete === false ? "Incomplete" : `Over ${offlineApi.staleDays} days old`;
      head.append(badge);
    }
    const meta = document.createElement("p");
    meta.className = "offline-pack-meta";
    meta.textContent = [
      `Saved ${formatPackDate(pack.createdAt)}`,
      pack.complete === false ? null : offlineApi.formatBytes(pack.bytes),
      offlineApi.basemaps[pack.basemap]?.label,
      `detail zoom ${pack.maxZoom}`,
      pack.complete === false && pack.parts > 1 ? `${pack.partsDone ?? 0} of ${pack.parts} parts done` : null,
    ].filter(Boolean).join(" · ");
    const layers = document.createElement("p");
    layers.className = "offline-pack-meta";
    layers.textContent = `Includes: ${describePackLayers(pack)}`;
    const actions = document.createElement("div");
    actions.className = "offline-pack-actions";
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "view-button";
    viewButton.textContent = "Show on map";
    viewButton.addEventListener("click", () => {
      map.fitBounds(packLatLngBounds(pack));
      if (window.matchMedia("(max-width: 800px)").matches) {
        window.CampgroundlessSidebar.hide();
      }
    });
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "view-button";
    downloadButton.dataset.packAction = "download";
    downloadButton.textContent = pack.complete === false ? "Resume" : "Update";
    downloadButton.disabled = Boolean(offlineState.download);
    downloadButton.addEventListener("click", () => {
      void downloadOfflinePack({
        id: pack.id,
        name: pack.name,
        bounds: pack.bounds,
        maxZoom: pack.maxZoom,
        basemap: pack.basemap,
        layers: pack.layers,
        refresh: pack.complete !== false,
      });
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "view-button offline-delete";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm(`Delete “${pack.name}”? Its saved maps and data will be removed from this device.`)) {
        return;
      }
      deleteButton.disabled = true;
      try {
        await offlineApi.deletePack(pack);
        setOfflineMessage(`Deleted “${pack.name}”.`);
      } catch (error) {
        console.error("Could not delete the offline area.", error);
        setOfflineMessage("That area could not be deleted. Try again.", true);
      }
      offlineState.dataCache.clear();
      await renderOfflinePackList();
      if (offlineState.active) {
        await loadOfflinePacks();
        await rebuildOfflineLayers();
      }
    });
    actions.append(viewButton, downloadButton, deleteButton);
    item.append(head, meta, layers, actions);
    return item;
  }

  async function renderOfflinePackList() {
    if (!offlineApi?.supported) {
      return;
    }
    const packs = await offlineApi.listPacks().catch(() => []);
    offlinePackList.replaceChildren(...packs.map(packListItem));
    offlineEmpty.hidden = packs.length > 0;
    const storage = await refreshOfflineStorage();
    offlineStorage.textContent = storage.native
      ? `Saved areas use about ${offlineApi.formatBytes(storage.usage)}${Number.isFinite(storage.quota) ? `; about ${offlineApi.formatBytes(storage.quota - storage.usage)} is free on this iPhone` : ""}. They stay until you delete them or remove the app.`
      : Number.isFinite(storage.usage)
      ? `This site is using ${offlineApi.formatBytes(storage.usage)}${Number.isFinite(storage.quota) ? ` of about ${offlineApi.formatBytes(storage.quota)} available` : ""} on this device.${storage.persisted ? "" : " If the device runs low on space, the browser may remove saved areas."}`
      : "";
  }

  function initializeOfflinePanel() {
    if (!offlineView) {
      return;
    }
    if (!offlineApi?.supported) {
      document.getElementById("offline-unsupported").hidden = false;
      offlineForm.hidden = true;
      offlineToggle.disabled = true;
      return;
    }
    const prefs = readOfflinePrefs();
    Object.entries(offlineApi.basemaps).forEach(([value, basemap]) => {
      const label = document.createElement("label");
      label.className = "offline-choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "offline-basemap";
      input.value = value;
      input.checked = value === (offlineApi.basemaps[prefs.basemap] ? prefs.basemap : "usgs-topo");
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = basemap.label;
      const description = document.createElement("small");
      description.textContent = basemap.description;
      copy.append(title, description);
      label.append(input, copy);
      offlineBasemapChoices.append(label);
    });
    offlineDetailLevels.forEach(([zoom, label]) => {
      const option = document.createElement("option");
      option.value = String(zoom);
      option.dataset.label = label;
      option.textContent = `${label} (zoom ${zoom})`;
      offlineDetail.append(option);
    });
    offlineDetail.value = String(prefs.maxZoom ?? 15);

    const landLabel = document.createElement("label");
    landLabel.className = "offline-choice";
    const landInput = document.createElement("input");
    landInput.type = "checkbox";
    landInput.checked = true;
    landInput.disabled = true;
    landInput.dataset.locked = "true";
    const landText = document.createElement("span");
    landText.innerHTML = "<strong>Land boundaries</strong><small>Always included</small>";
    landLabel.append(landInput, landText);
    offlineLayerChoices.append(landLabel);
    Object.entries(overlayDefinitionsByKey).forEach(([key, definition]) => {
      const label = document.createElement("label");
      label.className = "offline-choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = key;
      input.dataset.overlay = "true";
      input.checked = Boolean(settings.overlays[key]);
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = definition.label;
      copy.append(title);
      label.append(input, copy);
      offlineLayerChoices.append(label);
    });

    offlineForm.addEventListener("change", (event) => {
      if (event.target.name === "offline-basemap" || event.target === offlineDetail) {
        writeOfflinePrefs({
          basemap: offlineBasemapChoices.querySelector("input:checked")?.value,
          maxZoom: Number(offlineDetail.value),
        });
      }
      updateOfflineEstimate();
    });
    offlineForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const options = selectedOfflineOptions();
      const plan = offlineTilePlan(options);
      const limit = offlineDownloadLimit();
      if (plan.bytes > limit) {
        updateOfflineEstimate();
        return;
      }
      if (
        plan.bytes > offlineLargeDownloadBytes &&
        !window.confirm(
          `This is a large download: about ${offlineApi.formatBytes(plan.bytes)} (${plan.tileCount.toLocaleString()} map images), ${formatDownloadTime(plan)} on fast Wi-Fi. This device can spare about ${offlineApi.formatBytes(limit)} for saved maps.\n\nUse Wi-Fi and keep the app open until it finishes. If it stops, choose Resume.\n\nStart the download?`,
        )
      ) {
        return;
      }
      void downloadOfflinePack({
        ...options,
        name: offlineName.value.trim() || offlineName.placeholder || "Saved area",
      });
      offlineName.value = "";
    });
    offlineCancelButton.addEventListener("click", () => offlineState.download?.abort());
    offlineToggle.addEventListener("change", async () => {
      if (offlineToggle.checked) {
        if (!(await enterOfflineMode("manual"))) {
          offlineToggle.checked = false;
          setOfflineMessage("Download an area first; there are no saved maps to show.", true);
        }
      } else {
        exitOfflineMode();
      }
    });
    window.addEventListener("beforeunload", (event) => {
      if (offlineState.download) {
        event.preventDefault();
      }
    });
    new MutationObserver(() => {
      if (!offlineView.hidden) {
        updateOfflineEstimate();
        void renderOfflinePackList();
      }
    }).observe(offlineView, { attributes: true, attributeFilter: ["hidden"] });
    map.on("moveend", () => {
      updateOfflineEstimate();
      updateOfflineStatus();
    });
    updateOfflineToggle();
    void loadOfflinePacks().then((packs) => {
      void renderOfflinePackList();
      if (packs.length && navigator.onLine === false) {
        void enterOfflineMode("auto");
      }
    });
    setTimeout(() => {
      if (!offlineState.active && !mapLoading.hidden) {
        void checkConnectivityAfterFailure();
      }
    }, 12000);
    window.addEventListener("offline", () => void enterOfflineMode("auto"));
    window.addEventListener("online", () => {
      if (offlineState.reason === "auto") {
        exitOfflineMode("Back online · showing live map data");
      }
    });
  }

  initializeOfflinePanel();
})();
