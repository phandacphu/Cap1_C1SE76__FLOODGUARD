# SOS operations map — Rescue Web

Branch: feature/rescue-sos-map. Integrates develop 655829c with reviewed Rescue
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
- node --test web/tests/*.test.cjs web/tests/*.test.mjs: 35 passed, 1 live-fixture test skipped.
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
