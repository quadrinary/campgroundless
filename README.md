# Campgroundless

A responsive California public-land boundary explorer for dispersed-camping trip planning. This is a static site intended for GitHub Pages.

## What the map does—and does not do

- Displays selected federal, state, and local public land management/ownership records in California from the **Fee** feature class.
- Filters a public ArcGIS-hosted layer reproducing USGS PAD-US 3.0 data by California and manager category. The layer is queried live as the map is used; the ArcGIS hosting endpoint is outside USGS.
- Shows the mapped manager, unit name, PAD-US public-access attribute, and source date when available.
- Does **not** determine whether dispersed camping is allowed at a site. Public-land boundaries, public-access attributes, and manager names are not camping authorization. Closures, road access, permits, fire rules, stay limits, and local restrictions must be verified directly with the responsible office.

The web map uses the USGS PAD-US 3.0 land-ownership layer. PAD-US is a compiled inventory; data age, completeness, scale, and accuracy vary by source. The ArcGIS service metadata reports data last edited on May 23, 2023. California's PAD-US 3.0 update included state, regional, local, and nonprofit data from the California Protected Areas Database (CPAD), but the map filters to selected government managers and fee records. It is not a parcel-level legal boundary map, does not provide comprehensive or current camping permission, and a missing polygon is not evidence that land is private or unavailable. The newer PAD-US 4.1 release is available from USGS; this live map does not claim to use it.

## Sources and attribution

- U.S. Geological Survey, Gap Analysis Project, [Protected Areas Database of the United States (PAD-US) 3.0](https://doi.org/10.5066/P9Q9LQ4B), public domain.
- PAD-US 3.0 [data overview](https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-overview) and [USGS PAD-US program page](https://www.usgs.gov/programs/gap-analysis-project/science/protected-areas).
- [Bureau of Land Management camping guidance](https://www.blm.gov/programs/recreation/camping), [U.S. Forest Service camping information](https://www.fs.usda.gov/visit/know-before-you-go/camping), and [CAL FIRE campfire permits](https://www.fire.ca.gov/prepare/campfire-permits). Current restrictions must be checked at the local office.
- Basemap tiles: [Esri World Street Map](https://goto.arcgisonline.com/maps/World_Street_Map). Attribution: Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, OpenStreetMap contributors, and the GIS User Community.

The app uses Leaflet and Esri Leaflet from unpkg.com. It is a static client-side site; the browser contacts the map/data providers directly.

## Map settings and API keys

Open **Settings** from the map navigation to select USGS PAD-US 3.0 or a custom PAD-US-compatible ArcGIS Feature Layer, toggle manager categories, choose Esri/OpenStreetMap/custom XYZ basemaps, enter optional provider keys, and set custom source attribution. Custom land services must expose the fields and manager codes used by PAD-US (`FID`, `State_Nm`, `FeatClass`, `Mang_Name`, `Unit_Nm`, `Loc_Nm`, `Pub_Access`, and `Src_Date`) because the map filters and popups rely on that schema.

Preferences and API keys are stored in that browser's `localStorage` and are not uploaded to this site. Map requests send a key only to the selected data or tile provider. A browser-stored key is accessible to people with access to the browser and is visible in outgoing requests; never save a private server secret here. Use provider-restricted, low-privilege keys. Esri/OpenStreetMap defaults work without keys.

The data and basemap selections apply on the map page. Layer toggles also save when changed from the map sidebar. Settings are per browser/device, not an account-wide profile.

## Local development

Open `index.html` in a modern browser or serve this folder with any static HTTP server. No build step or package installation is required.

## Hosting on GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the repository root to GitHub Pages whenever changes are pushed to `main`, or when manually started. GitHub Pages must be enabled for the repository with **GitHub Actions** as its build and deployment source.
