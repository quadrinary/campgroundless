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
- Base map tiles © [CARTO](https://carto.com/attributions); geographic data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

The app uses Leaflet and Esri Leaflet from unpkg.com. It is a static client-side site; the browser contacts the map/data providers directly. Geolocation is only requested after the visitor presses the location button.

## Local development

Open `index.html` in a modern browser or serve this folder with any static HTTP server. No build step or package installation is required.

## Hosting on GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the repository root to GitHub Pages whenever changes are pushed to `main`, or when manually started. GitHub Pages must be enabled for the repository with **GitHub Actions** as its build and deployment source.
