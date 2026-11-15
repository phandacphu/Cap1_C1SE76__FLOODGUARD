# Rescue Web — Điểm tránh trú an toàn (public catalogue v2)

Branch: feature/rescue-safe-location-catalog. Base: develop 1b79f08.
Contract: docs/safe-location-catalog-api.md on develop (PR #127 deployed).

## Delivered

Route /rescue/safe-locations inside existing RESCUE_STAFF guard. Left catalogue,
right map and selected detail panel; stacked on narrower screens. Uses the
existing dark Rescue theme. No Admin/Mobile/Backend/SOS workflow changes.
No extra flood layers, capacity, availability, amenities, contact phone or ETA.
No create/edit/delete controls. No dependency or .env changes.

Data retrieval is isolated in catalogApi.ts via the read-only CatalogSource.
Production uses live API only, never falls back to TEST data. Controller/GPS test
fixtures are explicitly labelled TEST ONLY and are never imported by the page.

- GET /safe-locations, optionally complete latitude+longitude, and GET /:id.
  Public requests without JWT; no-store; 70s timeout; validated envelope, geometry,
  types, nullable description/distance, duplicate IDs and exact detail ID.
  HTTP/non-JSON/network errors remain errors. No radius/type/search/page queries.
- Browser GPS watch, explicit refresh, last successful GPS/time retained on loss.
  Without GPS, no default query origin, blue marker or invented distance. Initial
  map camera at Da Nang is labelled a reference center only. GPS changes cancel
  older list reads and reload distances. Distances come from Backend, sorted by
  raw value before display rounding; zero and all far points are retained.
- Search name/address and type filter are local to loaded data and preserve order;
  table/cards and green markers use the same filtered array. Blue marker is real
  browser GPS only. Stable ID selection opens the same detail from card or pin.
- User-only camera commands: own location, fit all filtered points, selected card.
  Data/GPS refresh never automatically recenters. Maps URLs use destination GPS,
  independent of whether the browser user has GPS. No safe-route claim.
- List and detail generations/aborts reject late responses. Same-origin refresh
  and repeated selection deduplicate. Network failure keeps previous data/time
  with “Chưa thể cập nhật”. Successful refresh replaces by ID. Empty success,
  no search match, first-load error and detail 404 are distinct. Deleted selected
  point removes its card/pin and displays “Địa điểm không còn được cung cấp”.

## Shared files changed

- web/src/App.tsx: add guarded Rescue route only.
- web/src/components/layout/navConfig.ts: connect Rescue shelter menu only.
- web/src/components/layout/RescueHeader.tsx and RescueLayout.tsx: optional
  syncHint, used here for manual refresh. Existing callers retain their default
  hint; no SOS fetching or behavior is changed.

## Verification

Environment: Linux x64, Node 24.22.1, TypeScript 6, Vite 8.3.1.
Lint/build: PASS (logs attached; existing bundle-size advisory).
All Web tests with SAFE_CATALOG_LIVE_DIR: 60 PASS, 2 optional earlier
live-fixture tests SKIP, 0 failures. Without captures: 59 PASS, 3 SKIP.
17 catalogue tests PASS, including captured Render v2 list/detail responses.
git diff --check: PASS. Logs normalized (no trailing spaces/blank EOF blocks).

Automated cases: public URL/query/auth contract; valid zero GPS/distance; strict
invalid/null/error payloads; all five types; empty/long descriptions; no fake
capacity/contact; raw sorting and far points; local filtering; directions; serial
refresh; late GPS/list/detail rejection; offline retained data/time; empty retry;
selected deletion/404; same-ID coordinate refresh; repeated selection; unmount;
GPS denial/unavailable/last-known/cleanup; explicit GPS update.

Read-only Render checks: /safe-locations without GPS, with a synthetic matching
GPS pair, and exact-ID detail all HTTP 200 and pass the real parser. See
public-api-check.json. This is not a device-GPS or Admin-write acceptance test.

## Not yet verified (do not report as passed)

- Browser rendering/card-pin click/Maps/window sizes and physical GPS permissions.
  Local Vite started on 127.0.0.1:5189; cloud browser returned
  net::ERR_CONNECTION_REFUSED. No successful browser screenshots/video captured.
- Matching the exact “ảnh mẫu 4” pixel layout: reference image was not attached;
  implemented the specified left-list/right-map/detail layout and existing theme.
- Real TEST Admin add/edit/delete -> Rescue reload and live detail 404. No live
  catalogue data was mutated. Unit tests cover the read/state transitions only.
- Browser GPS allowed/denied/lost, last-known timestamp and real-device distance.

## Run / manual acceptance

Keep VITE_API_URL ending /api and VITE_MAPTILER_KEY in web/.env.local. No Firebase
key is needed. npm install; npm run dev from web; login Rescue; open
/rescue/safe-locations. Allow or deny GPS and verify both paths still show data.
Use agreed TEST catalogue records for Admin changes, then refresh Rescue:
add -> card/pin; edit -> same ID/new coordinates/detail; delete selected -> removed
card/pin and unavailable notice. Never modify another person's real records.

Check narrow (390px), tablet (768px) and desktop (1440px), same-ID card/pin,
long descriptions, search/no match, no-GPS distance absence, valid 0 km, fit all,
current location, Google Maps destination, offline/recovery and fresh timestamps.
Record sanitized Network method/path/status, SHA, browser/device and screenshots.
No passwords, Authorization headers or device GPS need to be included in reports.

Default tests: node --test web/tests/*.test.cjs web/tests/*.test.mjs from repo root.
To replay captured public responses, set SAFE_CATALOG_LIVE_DIR to a directory
containing list.json, gps.json and detail.json from the above three GET requests;
otherwise that optional replay test skips. No mock data is used by production UI.

No push/merge/deploy performed; Phu reviews and decides merge.


## Combined working branch: retain previous HIST display

At the user's request, this branch now also includes feature/CCF-105-181-rescue-
hist-details through b11a6f9. Opening /map retains circular historical buffers ON,
HIST points and Admin polygons with metadata popups; pins remain above polygons.
Radar stays off/lazy. This is the existing HIST implementation merged into the
catalogue branch, so switching to the shelter screen no longer drops pending HIST
work. No geometry or GPS positions are fabricated or changed. This expands the
original catalogue-only PR scope and must be called out to the reviewer.

Combined validation: lint/build PASS; 67 tests PASS, 2 older optional capture tests
SKIP with SAFE_CATALOG_LIVE_DIR and HIST_LIVE_DIR captures supplied. See combined
logs. Browser appearance and physical GPS acceptance remain NOT RUN. No merge
into develop or deployment was performed.
