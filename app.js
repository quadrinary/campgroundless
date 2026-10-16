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
    return settings.basemap === "osm" ? `osm:${settings.osmLayer}` : "esri";
  }

  function applyBasemapOption(option) {
    if (option === "custom" && settings.basemapUrl) {
      settings.basemap = "custom";
    } else if (option.startsWith("osm:")) {
      settings.basemap = "osm";
      settings.osmLayer = option.slice("osm:".length);
    } else {
      settings.basemap = "esri";
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
  const layerControl = L.control({ position: "bottomright" });
  layerControl.onAdd = () => {
    const container = L.DomUtil.create("div", "leaflet-control map-layer-control");
    const button = L.DomUtil.create(
      "button",
      "map-layer-toggle leaflet-control-layers-toggle",
      container,
    );
    button.type = "button";
    button.title = "Choose map style";
    button.setAttribute("aria-label", "Choose map style");
    button.setAttribute("aria-expanded", "false");

    const panel = L.DomUtil.create("div", "map-layer-panel", container);
    panel.id = "map-layer-panel";
    panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "Map styles");
    const heading = L.DomUtil.create("strong", "map-layer-heading", panel);
    heading.textContent = "Map style";

    const options = [
      ["esri", "Esri World Street Map"],
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

    layerStatus = L.DomUtil.create("span", "map-layer-status", panel);
    layerStatus.setAttribute("role", "status");
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

  map.on("click", (event) => openNoteEditor(event.latlng));
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
