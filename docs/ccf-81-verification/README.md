# CCF-56/57 verification update 2026-11-07

Supersedes the previous status/severity-based area implementation and checklist.

## Confirmed backend contract change

Merged origin/develop 12f20f1. backend/src/services/flood-area.service.js explicitly rejects status/severity for areas and uses areaType: flood or low_lying; legacy areaType may be null. Warning severity remains independent. The public demo returned six areas, all accepted by the updated validator.

## Changes

- Area model, filters, legend, popup and list now use flood/low_lying/unclassified. Missing classification is never silently assigned active/low. Default shows all areas, including legacy records.
- Keep finite numeric coordinate validation and reject malformed polygons as a whole.
- Select a listed area to fit its bounds. Initial view focuses the first area rather than fitting unrelated global test records into one world view.
- Explicit referrer policy on OSM tile images, scoped Leaflet image sizing, failed-tile tracking with load/unload recovery, redraw on manual retry and browser online event. ResizeObserver remains enabled.
- Preserve the newly integrated /admin/historical-map route and give it a separate sidebar entry. No changes to Backend implementation beyond merging develop.
- Public data cache/dedup, correct data.floodAreas parsing, active alert count and stale labels remain intact.

## Validation

npm ci; npm run lint; npm run build: PASS. Build warns about JS chunk >500 kB.
node --test tests/floodAreaService.test.cjs: five offline groups pass; live test is skipped unless LIVE_FLOOD_AREAS points to a captured JSON file.
Executed six groups with LIVE_FLOOD_AREAS=/tmp/ccf81-evidence/live-areas.json; all passed, none skipped. JSON was captured from https://floodguard-backend-demo.onrender.com/api/flood-areas on 2026-11-07. See service-tests.txt for output.

## Remaining acceptance on the user's Mac

The actual tile error on that machine is still unidentified (no browser request status supplied). The changes improve CSS/lifecycle/recovery; they cannot guarantee delivery through network/provider failures. No UI screenshot or real Admin/Rescue login is claimed as tested here.

Run npm ci, npm run lint, npm run build, node --test tests/floodAreaService.test.cjs, npm run dev -- --port 5173 --strictPort. Open Admin/Rescue map. Confirm areas/filters/popups and /admin/historical-map plus old routes. Inspect Network tile requests if basemap still fails. Record exact HTTP/net error. Check offline/stale/retry and no overview API fan-out. Attach genuine screenshots before leader merge.
