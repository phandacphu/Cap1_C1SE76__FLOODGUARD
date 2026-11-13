# SOS operations map — Rescue Web

Branch: feature/rescue-sos-map-layers. Integrates develop 655829c with reviewed Rescue
SOS v2 dc740ea, which is not yet on that develop. This dependency is intentional:
the old priority query is rejected by the deployed SOS API. No Backend, Admin,
Resident or Mobile files changed.

/rescue/sos defaults to the active group and map + list. All, rescued and
legacy_other filters share the same dataset between list and map. Only newest
or oldest is sent. Search is explicitly local to loaded results. Red markers
mean active (both 'needs rescue' and 'not yet rescued'); green means rescued;
gray means legacy/unknown, never silently converted to rescued.

MapTiler uses existing VITE_MAPTILER_KEY. SOS polls reuse the serial 15-second
resource, stop on hidden tabs and retain stale data with the existing notice.
The map uses location, never initialLocation for directions. Camera does not
follow polling; the user can explicitly fit all located SOS. Missing coordinates
remain visible in the list and have an explicit count. Popups render React text,
link to detail, show water/situation/latest GPS and completion actor/time.

Flood-area fills use areaType (yellow flood, red low_lying, gray unclassified).
Borders use the highest currently effective active alert associated by areaId.
No safety score or current flooding is inferred from classification or the
absence of alerts. Failed layers retain old data with explicit warnings.
Public context reads share existing 60-second service caches, refresh in the
visible tab and support a forced manual refresh. No Admin overview APIs used.
Directions are external and are not evaluated as flood-safe routes.

Validation:
- npm run lint: passed.
- npm run build: passed (bundle-size advisory).
- node --test web/tests/*.test.cjs web/tests/*.test.mjs: 39 passed, zero skipped with captured public Render fixtures.
- git diff --check: passed.
- Browser verification NOT RUN: Playwright Chromium executable unavailable;
  Vite also failed with uv_interface_addresses in this environment.
- Render/login/real GPS/completion TEST workflow NOT RUN; no live mutations.

Remaining acceptance on a real browser with agreed TEST SOS only:
1. Active/all/rescued filters: markers and list agree; missing GPS counted.
2. Popup detail/directions reflect the latest GPS after refresh; panning stays.
3. Confirm on detail: active marker leaves after refresh; rescued group retains
   server actor/time. Other rescuer completion behaves the same.
4. MapTiler with valid restricted key; tile retry on failure.
5. Area-type fills, active-time alert borders, missing/failed/stale alerts never
   claim safety; manual context reload and recovery.
6. Search/date/sort/view switches, empty/error/401, narrow screen and navigation.

Do not merge/deploy before team review and real-browser evidence.

## Visual-map layers integrated into SOS map

Independent historical point pins, HIST polygons, buffers and radar toggles.
Points and HIST polygons default on; large buffer/radar overlays default off so
SOS remains readable. Historical panes stay below SOS markers. Popup API text is
assigned through textContent (never interpreted as HTML). GeoJSON validation and
colors reuse the existing map service/icon. Empty reload snapshots remove deleted
features; failed layer refresh keeps cached geometry with its source timestamp
and warning. Shared per-source 60-second caches deduplicate historical reads;
manual reload bypasses cache, and hidden tabs stop polling.

Ordinary areas have flood/low_lying/unclassified filters and an optional active-
alert filter. The expandable area list uses the same filters. These remain
separate from historical layers. No current-flood or safety classification is
inferred from any historical layer.

### Public Render API evidence

2026-11-13T21:46:45.934173+07:00

Read-only checks of https://floodguard-backend-demo.onrender.com/api:

| Endpoint | HTTP | Observed result |
|---|---|---|
| /flood-history/points | 200 | layer=points, 27 features |
| /flood-history/areas | 200 | layer=areas, 4 features |
| /flood-history/buffers | 200 | layer=buffers, 2 features |
| /flood-history/radar | 200 | layer=radar, 157 features |
| /flood-areas | 200 | 13 areas |
| /flood-alerts/active | 200 | empty successful list |
| /rescue-requests?state=active&sort=newest | 401 | no authentication supplied |

Counts reflect the observation time and are not hardcoded in UI. Captured public
history payloads passed parseHistoricalCollection; ordinary areas passed the
existing service test. No protected SOS payload or token was captured.

Full tests with captured fixtures: 39 passed, zero failures/skips. Run with
SOS_MAP_LIVE_DIR pointing to points.json/areas.json/buffers.json/radar.json and
LIVE_FLOOD_AREAS pointing to the captured /flood-areas response. Without fixtures,
these optional live-parser tests skip. Browser UI, valid MapTiler tiles and
authenticated Render SOS completion/GPS acceptance remain unverified here.
