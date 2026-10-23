// Builds place-search requests for the selectable providers and converts their
// responses into the Nominatim-shaped objects the map's search code expects.
(() => {
  "use strict";

  const urls = {
    nominatim: "https://nominatim.openstreetmap.org/search",
    photon: "https://photon.komoot.io/api/",
  };
  // Western US bounds: west, south, east, north.
  const bounds = [-124.8, 25.8, -93.5, 49.1];

  function buildRequest(provider, customUrl, term) {
    if (provider === "photon") {
      const endpoint = new URL(urls.photon);
      endpoint.searchParams.set("q", term);
      endpoint.searchParams.set("limit", "8");
      endpoint.searchParams.set("lang", "en");
      endpoint.searchParams.set("bbox", bounds.join(","));
      return endpoint;
    }
    const endpoint = new URL(provider === "custom" && customUrl ? customUrl : urls.nominatim);
    endpoint.searchParams.set("q", term);
    endpoint.searchParams.set("format", "jsonv2");
    endpoint.searchParams.set("limit", "5");
    endpoint.searchParams.set("addressdetails", "1");
    endpoint.searchParams.set("extratags", "1");
    endpoint.searchParams.set("countrycodes", "us");
    endpoint.searchParams.set("viewbox", `${bounds[0]},${bounds[3]},${bounds[2]},${bounds[1]}`);
    endpoint.searchParams.set("bounded", "1");
    return endpoint;
  }

  function photonPlace(feature) {
    const props = feature?.properties ?? {};
    const [lon, lat] = feature?.geometry?.coordinates ?? [];
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
    if (props.countrycode && props.countrycode.toUpperCase() !== "US") return null;
    const street = [props.housenumber, props.street].filter(Boolean).join(" ");
    const parts = [props.name, street, props.city || props.district, props.county, props.state, props.postcode, props.country]
      .filter((part, index, list) => part && list.indexOf(part) === index);
    if (!parts.length) return null;
    return {
      lat: String(lat),
      lon: String(lon),
      name: props.name || "",
      display_name: parts.join(", "),
      category: props.osm_key || "",
      type: props.osm_value || "",
      address: {
        road: props.street,
        city: props.city,
        county: props.county,
        state: props.state,
        postcode: props.postcode,
        country: props.country,
      },
      extratags: {},
    };
  }

  function parseResponse(provider, data) {
    if (provider === "photon") {
      if (!data || !Array.isArray(data.features)) {
        throw new Error("Place search service returned an unsupported response.");
      }
      const seen = new Set();
      return data.features
        .map(photonPlace)
        .filter((place) => place && !seen.has(place.display_name) && seen.add(place.display_name))
        .slice(0, 5);
    }
    if (!Array.isArray(data)) {
      throw new Error("Place search service returned an unsupported response.");
    }
    return data;
  }

  function attribution(provider) {
    if (provider === "photon") {
      return 'Place searches go to Photon by komoot when submitted; no autocomplete. Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors · <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a>';
    }
    if (provider === "custom") {
      return "Place searches go to your custom search endpoint when submitted; no autocomplete. Results follow that provider's data and terms.";
    }
    return 'Place searches go to OpenStreetMap when submitted; no autocomplete. Place search by <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer">usage policy</a>';
  }

  window.CampgroundlessPlaceSearch = Object.freeze({ urls, buildRequest, parseResponse, attribution });
})();
