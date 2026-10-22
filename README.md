# Campgroundless

A responsive public-land boundary explorer for California, Oregon, Washington, Idaho, Nevada, Utah, Arizona, Colorado, New Mexico, and Texas, intended to support dispersed-camping trip planning. This is a static site intended for GitHub Pages.

## What the map does—and does not do

- Displays selected federal, state, and local public land management/ownership records in California, Oregon, Washington, Idaho, Nevada, Utah, Arizona, Colorado, New Mexico, and Texas from the **Fee** feature class.
- Filters a public ArcGIS-hosted layer (USGS Manager_Name service) reproducing national PAD-US 3.0 data by the ten states and manager category. The layer is queried live as the map is used; the ArcGIS hosting endpoint is outside USGS.
- Shows the mapped manager, unit name, PAD-US public-access attribute, and source date when available.
- Shows an agency logo or labeled federal-manager icon in selected-location and land-area popups for BLM, U.S. Fish and Wildlife Service, National Park Service, U.S. Army Corps of Engineers, Bureau of Reclamation, Forest Service, and other federal-manager records. An icon identifies the mapped manager only; it does not establish access or camping permission.
- Lets visitors attach browser-local notes/reviews and camping, travel, or landmark icons to clicked map locations. Clicking a managed-land polygon opens its information popup; select **Write note here** and choose an icon to open the note editor at that exact point. Each saved note can be shared with a view-only link containing a snapshot of that note; the link data is stored in its URL fragment, not uploaded, and anyone with the link can view it. Edits made after a link is created do not change that snapshot.
- Does **not** determine whether dispersed camping is allowed at a site. Public-land boundaries, public-access attributes, and manager names are not camping authorization. Closures, road access, permits, fire rules, stay limits, and local restrictions must be verified directly with the responsible office.

The web map uses the USGS PAD-US 3.0 land-ownership layer. PAD-US is a compiled inventory; data age, completeness, scale, and accuracy vary by source and state. The ArcGIS service metadata reports data last edited on March 20, 2024. The map filters to selected government managers and fee records in California, Oregon, Washington, Idaho, Nevada, Utah, Arizona, Colorado, New Mexico, and Texas. It is not a parcel-level legal boundary map, does not provide comprehensive or current camping permission, and a missing polygon is not evidence that land is private or unavailable. The newer PAD-US 4.1 release is available from USGS; this live map does not claim to use it.

## Sources and attribution

- U.S. Geological Survey, Gap Analysis Project, [Protected Areas Database of the United States (PAD-US) 3.0](https://doi.org/10.5066/P9Q9LQ4B), public domain.
- PAD-US 3.0 [data overview](https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-overview) and [USGS PAD-US program page](https://www.usgs.gov/programs/gap-analysis-project/science/protected-areas).
- Agency marks in land popups use agency-hosted artwork where available; the U.S. Army Corps of Engineers mark is from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:United_States_Army_Corps_of_Engineers_logo.svg), and unspecified federal managers use a generic badge. These marks identify the mapped manager and do not imply endorsement or camping permission.
- [Bureau of Land Management camping guidance](https://www.blm.gov/programs/recreation/camping), [U.S. Forest Service camping information](https://www.fs.usda.gov/visit/know-before-you-go/camping), and [CAL FIRE campfire permits](https://www.fire.ca.gov/prepare/campfire-permits) (California-specific). Current restrictions must be checked with the local office and applicable state agencies.
- Basemap tiles: [Esri World Street Map](https://goto.arcgisonline.com/maps/World_Street_Map). Attribution: Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, OpenStreetMap contributors, and the GIS User Community.
- Default basemap: [OpenFreeMap](https://openfreemap.org) vector streets (OpenMapTiles schema, data from OpenStreetMap contributors), rendered with MapLibre GL so labels stay crisp on high-DPI screens; falls back to Esri World Street Map when WebGL is unavailable.
- Additional reference basemaps: [Esri World Imagery](https://goto.arcgisonline.com/maps/World_Imagery), [Esri World Hillshade](https://goto.arcgisonline.com/maps/Elevation/World_Hillshade), and [USGS The National Map Topo](https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer). Imagery and hillshade are compiled from multiple sources; attribution is provided by their services. The USGS topo service combines current National Map and other public data; its source credits are shown in the map.
- OpenStreetMap basemap styles: [standard tiles](https://operations.osmfoundation.org/policies/tiles/), [Humanitarian OpenStreetMap Team style](https://www.hotosm.org/), and [OpenTopoMap](https://opentopomap.org/). These are separate tile providers/styles based on OpenStreetMap data, not separate land or trail data layers. Availability and usage terms differ; do not bulk-download tiles. Attribution is shown on the map.
- Optional U.S. Forest Service reference overlays: [Recreation Opportunities](https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer) (service says updated nightly), [National Forest System Roads](https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer) (service says road data is updated daily), [National Forest System Trails](https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer) (trail attribute completeness varies by forest), and [Motor Vehicle Use Map (MVUM) routes](https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer). When enabled, the MVUM overlay includes the Forest Service's own road/trail symbol legend, including vehicle types and seasonal designations. The MVUM route service depicts designated motor-vehicle use and seasonal vehicle restrictions, but its coverage is not complete for every forest and data is refreshed unit by unit as approved; check the current official MVUM for the specific forest. A separately toggleable roads sublayer shows roads mapped as closed to motorized uses. These are operational reference data, not real-time access, closure, or camping-permission feeds; verify current conditions with the responsible Forest Service office.
- Optional BLM National Ground Transportation Linear Features (GTLF) motorized road datasets: [Public Motorized Roads](https://www.arcgis.com/home/item.html?id=f94999eb674d4085be0c86729fe4a151) and [Limited Public Motorized Roads](https://www.arcgis.com/home/item.html?id=4a2d788c46804bfbb7288d05184e2936). The map filters the national services to `ADMIN_ST` values for California, Oregon, Washington, Idaho, Nevada, Utah, Arizona, Colorado, New Mexico, and Texas. Its legend uses solid green and dashed rust lines to distinguish the public-release dataset subsets; the names do not confirm that a particular road is legally accessible to the public, currently open, or suitable for a vehicle. These GTLF datasets include transportation line features and not just roads. Verify route designations and current access with the responsible BLM office.
- Optional BLM recreation-site overlay: [BLM National Recreation Site Points](https://www.arcgis.com/home/item.html?id=7438e9e800914c94bad99f70a4f2092d), queried for California, Oregon, Washington, Idaho, Nevada, Utah, Arizona, Colorado, New Mexico, and Texas (`ADMIN_ST`) and clipped to those states' boundaries from [U.S. Census Bureau TIGERweb](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0); source administrative-state values do not always match the feature coordinates. Results are loaded in object-ID batches so the complete multi-state result is not silently limited by the service's transfer cap. Marker colors follow the service renderer's `FET_TYPE` categories; Information Center Site, Campground, Trail Head, and Unknown categories use the corresponding Visitor Centers, Campground Camping, Trailhead, and Unknown symbols from the Forest Service recreation renderer. Water based, Overnight, Day use, Toilet, Potable water, Parking, Airplane landing strip, Natural/endangered area, and OHV categories use symbols from the [NPS Map Symbol Library](https://github.com/nationalparkservice/symbol-library) (BSD license, copyright Mapbox, Inc.; copy in `icons/nps/LICENSE.txt`); Recreation management area and Other categories remain colored circles. Symbols identify facility type only. The map legend lists the categories and matching symbols. The national public-release point dataset lists varied facility types, including campgrounds, trailheads, and day-use sites; the service describes it as an interim data standard to be republished. The service currently has no Texas (`ADMIN_ST = TX`) recreation points, so Texas BLM land appears only in the land-ownership layer. A site point or popup is not confirmation of current operation, camping availability, fees, or authorization. Check the linked site details and current local BLM guidance.
- Nearest named-road reference: [U.S. Census Bureau TIGERweb Transportation](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer), using primary, secondary, and local roads (service metadata dated January 1, 2026). Land and map-point popups show the nearest named Census road within 10 km and its straight-line distance to the closest mapped line segment. Road-detail popups also attempt to calculate distance along connected Census road geometry when the selected overlay route matches that geometry within 20 m (about 66 ft) and the local line directions are within 45 degrees. The route search is limited to returned data within 10 km of the click, and network results are withheld if the source route cannot be matched, the returned road data is truncated, or no named road is connected within the search graph. In those cases the popup says road distance is unavailable and retains the separately labeled straight-line reference. Calculated network distance is a mapped-geometry estimate, not driving directions; Census road names and classifications do not confirm local jurisdiction, legal public access, or current conditions.
- Place search: [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) search service and [usage policy](https://operations.osmfoundation.org/policies/nominatim/). Search results are limited to the ten-state region, attributed to OpenStreetMap, and requested only after the user submits a search; there is no autocomplete. Repeated searches are cached in memory for the page session, and this browser waits at least one second between uncached requests. Do not submit personal or confidential information. The public Nominatim service has a strict maximum of one request per second per application; if traffic grows beyond a modest level, use a provider or shared proxy with compliant global rate limiting and caching.

The app bundles Leaflet, Esri Leaflet, MapLibre GL and the Leaflet MapLibre bridge in `vendor/` so it can start without a connection. It is a static client-side site; the browser contacts the map/data providers directly.

## Map settings and API keys

Open **Settings** from the map's side navigation (the same panel style as Offline maps; on both the website and the iPhone app). It has five groups:

- **Map** — basemap, land-manager categories, recreation-site minimum zoom, and what tapping the map does while a popup is open.
- **Display** — theme, text sizes, and the reminder/source lines under the map.
- **Storage** — data kept on this device, with buttons to clear recent searches or the app file cache.
- **Backup** — export or import settings, saved locations & notes, and recent searches as one file (see [Backups](#backups)).
- **Advanced** (collapsed) — land data source (USGS PAD-US 3.0 or a custom PAD-US-compatible ArcGIS Feature Layer), place-search endpoint, custom XYZ basemap and attribution, optional API keys, and reset.

Map and Display changes apply to the map immediately; there is no Save button. Advanced changes are validated, saved, and then reload the map with Settings reopened. The old `settings.html` address redirects to the panel. The recreation-site setting chooses the minimum zoom level at which both USFS and BLM recreation-site layers appear (zoom 11 or closer by default). BLM sites are hidden to match the Forest Service service's 1:400,000 scale limit; the setting can make both layers appear only at closer zooms, but cannot override that source limit.

The map’s **Layers** button toggles optional USFS and BLM recreation sites, USFS roads, motorized-road-closure, trails, MVUM routes, and BLM GTLF road dataset overlays. Each enabled reference overlay shows its own legend. BLM sites are queried for all ten states and clipped to their Census TIGERweb state boundaries; site records are fetched in object-ID batches to avoid a service transfer limit. Click a mapped USFS or BLM recreation-site symbol to open available source-record details; missing information is not evidence of availability, and a site does not establish camping permission.

Clicking a map point shows the nearest named primary, secondary, or local road in Census TIGERweb (searched up to 10 km) and its straight-line distance to the nearest point on that mapped road; this is not driving distance and Census data does not establish legal public access. Clicking a mapped USFS/BLM road also retrieves available route restrictions and nearby PAD-US land attributes, and attempts a road-network distance to a named Census road. Network distance is shown only when the selected overlay road matches aligned Census geometry within 20 m and a connected route is found in the returned graph; otherwise it is explicitly unavailable, with straight-line distance kept separate. The mapped network distance is not a driving route, access confirmation, or assurance that all connecting roads were returned. Road hit tolerance adapts to map zoom (about 12 screen pixels, bounded to 35–400 m); zoom in for precise selection.

All recreation, road, land, and imagery layers are reference only; coverage, update timing, and restrictions can be incomplete or outdated. Some Forest Service dynamic map services render by the rectangular map view, which can include portions of adjacent states near the coverage edges. This map's PAD-US and BLM state filters and BLM state-boundary clipping are limited to California, Oregon, Washington, Idaho, Nevada, Utah, Arizona, Colorado, New Mexico, and Texas. Verify current rules with the responsible land manager. Custom land services must expose the PAD-US fields used by the map (`FID`, `State_Nm`, `FeatClass`, `Mang_Name`, `Unit_Nm`, `Loc_Nm`, `Pub_Access`, and `Src_Date`). Custom place-search endpoints must use HTTPS and return a Nominatim-compatible JSON array with `lat`, `lon`, and `display_name` fields.

Settings also provide three interface text-size sliders with 1 px increments and a ±5 px range around each default: body text and field labels (7–17 px, default 12 px), search/map status/source text (6–16 px, default 11 px), and small captions/toolbar notes (5–15 px, default 10 px). These preferences apply immediately and are saved with other browser-local settings.

Preferences and API keys are stored in that browser's `localStorage` and are not uploaded to this site. Map requests send a key only to the selected data or tile provider. A browser-stored key is accessible to people with access to the browser and is visible in outgoing requests; never save a private server secret here. Use provider-restricted, low-privilege keys. Esri/OpenStreetMap defaults work without keys.

Map notes and their selected icons are saved in browser storage only; they are not uploaded or synchronized (use a [backup](#backups) to move them). Clearing this browser's site data removes them. A share link contains the selected note's title, text, icon, and coordinates in its fragment. Anyone with the link can read that snapshot, and URL contents may be visible in browser history or wherever the link is forwarded. Shared notes are view-only, do not alter the recipient's saved notes, and do not confirm camping permission. Do not enter sensitive information.

Land-manager filters and reference overlays save when changed from the map; overlay preferences are per browser/device, off by default, and can be reset with the other settings.

## Backups

**Settings → Backup → Export backup** saves a single JSON file (`campgroundless-backup-YYYY-MM-DD.json`). The website downloads it; the iPhone app opens the share sheet so it can be saved to Files, AirDropped, or emailed. **Import backup…** reads such a file on any device and shows what it contains before anything changes.

- **Contents:** any of settings, saved locations & notes, and recent searches (chosen with checkboxes). Offline map areas are not included; download them again on the new device.
- **API keys** are left out unless *Include API keys* is turned on. Importing a file without keys keeps the keys already on the device.
- **Merge or replace:** merging keeps this device's saved locations and searches and adds the file's; when the same note is in both, the most recently edited copy wins. Replacing deletes notes and searches that are only on this device (after a confirmation).
- **Checks:** files must have `"format": "campgroundless-backup"` and a supported `version` (currently 1), be under 5 MB, and hold at most 5,000 notes. Unknown settings are ignored, custom endpoints must use HTTPS, malformed notes are skipped, and the import preview warns when the file would point the map at a different land data, place-search, or basemap service.
- **Privacy:** the file contains the coordinates and text of your saved notes (and keys, if included). It is not uploaded anywhere by Campgroundless; keep it private.

Format (version 1):

```json
{
  "format": "campgroundless-backup",
  "version": 1,
  "exportedAt": "2026-10-22T21:30:00.000Z",
  "app": { "build": "122", "platform": "web" },
  "includesApiKeys": false,
  "settings": { "basemap": "esri-topo" },
  "notes": [{ "id": "…", "lat": 38.5, "lng": -120.2, "title": "…", "icon": "camp", "body": "…", "createdAt": "…", "updatedAt": "…" }],
  "recentSearches": [{ "term": "Mono Lake", "at": "…" }]
}
```

## Offline maps

Open **Offline maps** in the side rail to save the visible map area for use without a data connection. A saved area always includes PAD-US land boundaries; you choose a basemap (USGS Topo or USGS Imagery + Topo, both public domain), a detail level (up to zoom 16). Size is limited only by storage: a download may use up to 80% of the space the browser reports as still available to this site (2 GB if the browser does not report it), and downloads over 500 MB ask for confirmation with an estimated size and time, and which reference overlays to include. Road and recreation-site records are saved as data, so their popups work offline; other overlays are saved as images. Areas over 5,000 tiles download automatically in parts (each at most 0.5° across) but are saved and listed as a single area; if a download stops, Resume skips map images already saved.

The app switches to saved maps automatically when it detects no connection, or you can turn on **Use saved maps only**. Offline, land and road popups use the saved records; place search, nearest-named-road and road-network distance need a connection. On the website the OpenFreeMap vector basemap is not saved, because its terms require identifying requests in ways a browser cannot. The iPhone app can save it (see below). Saved areas are snapshots from the download date and are marked stale after 30 days. They cannot show new closures, fire restrictions, or emergency orders. Saved data stays in this browser (Cache Storage and IndexedDB) and can be updated or deleted from the panel; iOS may evict it if the device runs low on storage.

On the website, a service worker (`web/sw.js`) keeps a copy of the app files so the site opens offline. It never caches map data itself. The iPhone app does not use the service worker because its files are bundled.

## Repository layout

- `web/` — the website. This folder is published to GitHub Pages and is also bundled into the iPhone app. There is no build step.
- `ios/` — the Xcode project generated by Capacitor. `ios/App/App/public` is copied from `web/` by `npx cap sync ios` and is not committed.
- `capacitor.config.json`, `package.json` — the iPhone app configuration and Node tooling.
- `assets/` — source images for the app icon and splash screen (`npm run assets` regenerates them).
- `tests/` — Node tests (`npm test`) for the native bridge and offline storage.

## Local development

Serve the `web/` folder with any static HTTP server and open it in a modern browser. No build step or package installation is required for the website. Run `npm ci` and `npm test` (Node 22 or newer) to run the tests.

## iPhone app

The iPhone app wraps the same `web/` code with [Capacitor](https://capacitorjs.com/). `web/native.js` detects the app and adds native behavior; on the website it does nothing.

In the app:

- Location uses the native iOS location permission.
- Links to official sources open in an in-app Safari sheet.
- Field notes share through the iOS share sheet, and share links point at the public website.
- Saving notes, finding your location, and finishing downloads give haptic feedback.
- Offline map tiles are stored as files in the app's Library folder (not backed up to iCloud), instead of browser Cache Storage, so iOS will not evict them.
- **OpenFreeMap offline:** the default vector basemap can be saved for offline use. Every request carries the app's User-Agent (`Campgroundless/1.0 (iPhone app; +https://github.com/quadrinary/campgroundless)`, set in `capacitor.config.json`). To follow the [OpenFreeMap terms](https://openfreemap.org/), each OpenFreeMap download is limited to 3,000 requests and 50 MB, and uses at most 4 parallel requests. Vector tiles stop at zoom 14 and are drawn sharply when you zoom closer. Larger areas need the USGS basemaps.

All map and data services used by the app allow requests from the app's `capacitor://localhost` origin (checked October 2026), so no native HTTP proxy is needed.

### Building on a Mac

Requirements: macOS with Xcode 26 or newer (required by Capacitor 8), Node 22 or newer, and an Apple ID.

```sh
npm ci
npx cap sync ios   # copies web/ into the Xcode project
npx cap open ios   # opens Xcode
```

In Xcode, select the **App** target → **Signing & Capabilities**, choose your team, and run on a connected iPhone. With a free Apple ID (personal team), the app installs on your own iPhone but expires after 7 days. Run `npx cap sync ios` again after every change to `web/`.

### TestFlight and the App Store

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99 per year). This is required for TestFlight and the App Store.
2. In [App Store Connect](https://appstoreconnect.apple.com/), create an app with bundle ID `com.quadrinary.campgroundless`.
3. In Xcode, set the version and build number, choose **Any iOS Device**, then **Product → Archive → Distribute App → App Store Connect**.
4. When the build finishes processing, add yourself and other testers in the TestFlight tab. Internal testers (up to 100) need no review.

Before an App Store release:

- **Privacy:** the privacy policy is `web/privacy.html` (published at `/privacy.html`). In App Store Connect, the App Privacy answer is **Data Not Collected**: location is used only on the device, and there are no accounts, analytics, or tracking. The app sets `ITSAppUsesNonExemptEncryption` to `false` (it uses only standard HTTPS).
- **Review guideline 4.2 (minimum functionality):** reviewers reject apps that are only a website in a wrapper. Highlight the native features in the review notes: offline maps stored on the device, OpenFreeMap offline vector maps, native location, share sheet, and haptics.
- **Screenshots:** App Store Connect requires 6.9-inch iPhone screenshots.

## Hosting on GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the `web/` folder to GitHub Pages whenever changes are pushed to `main`, or when manually started. GitHub Pages must be enabled for the repository with **GitHub Actions** as its build and deployment source.
