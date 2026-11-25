# Rescue map — V2 bulletin adapter correction after 83af9f4

Review base: `83af9f4`. Target delivery branch: `feat/khoa-embed-warning-map`.
This document replaces the earlier integration description. That description no longer matched the map after its presentation was restored in 83af9f4.

## Approved scope retained

`FloodMapView` remains the shared full/embedded map. It keeps its existing Leaflet initialization, MapTiler configuration, initial camera, region toggle, area classification/color, polygon popups, HIST pins and points/areas/buffers/radar layer flow. Area geometry still comes from `/flood-areas`, and historical geometry still comes from the existing historical service. This patch does NOT migrate these sources to `/flood-alerts/zones`.

The helpers `createFloodMapCanvas`, `drawPublishedFloodZones` and `ZoneCoverageNotice` are NOT mounted by this screen. Their existing standalone tests are not evidence that this map integrates /zones or renders its coverage. No such integration is claimed. A future /zones migration requires Phu's acceptance of that separate scope.

## What is wired into the map now

- The actual map creates `createRescueWarningApi(token)` for the current authenticated session and calls its active reader through `useWarningResource`. Requests use `GET /flood-alerts/active`, with `Authorization: Bearer <current token>` and no shared public warning cache.
- Active V2 bulletins accept `scope=all_published_zones`, `endAt=null`, no severity and no areaId. They appear in a compact global bulletin section with title, content, GMT+7 time, null end time, and Rescue detail links.
- Area polygons and popups no longer select or rank bulletins by areaId/severity. The obsolete per-area alert checkbox/counts are removed, since global bulletins cannot truthfully support that filter. Region filters and the region toggle remain unchanged.
- During refresh, prior bulletin data is labeled unconfirmed. A transient error retains labeled stale bulletins; 401/403/404 removes them. An auth error never becomes a successful zero count. Retry can recover; a subsequent empty success removes deactivated bulletins.
- The full map and its async state remount when token/account/role changes. Old requests are aborted and cannot repopulate the new session. This also disposes prior popups.
- `floodAreaService` retains its public geometry/cache API but no longer exposes a V1 warning reader. The provider's shared active summary is only fetched for Dashboard; the map owns its request, avoiding duplicate /active requests from the global provider.

## Component verification

`web/tests/floodMapViewV2.test.cjs` mounts the exported FloodMapView and its real child component with real warning HTTP adapter, parser, resource hook and public area service. It replaces only browser/Leaflet surfaces and the historical hook. It does not replace the active-warning loader or its resource state.

Six cases cover full/embedded requests carrying the JWT, all active titles and endAt=null, keeping the existing geometry source, no /zones request, no bulletin title/severity attached to an area popup, refresh 401/403 discard/recovery, transient stale data, deactivation refresh, superseded responses, and account changes. The token test was also run against 83af9f4 and failed with actual Authorization `undefined`, expected `Bearer TOKEN-A` — proving it catches the reported regression.

Run all Web tests, including the isolated Backend-router integration test:

```bash
npm --prefix web ci --no-audit --no-fund
npm --prefix backend ci --ignore-scripts --no-audit --no-fund
npm --prefix web run lint
npm --prefix web run build
node --test web/tests/*.mjs web/tests/*.cjs
```

The older isolated /zones integration tests still exercise the actual Backend router with a fake in-memory DB. They do not establish that FloodMapView consumes /zones. No real Backend source or data is modified.

## Acceptance evidence not available

No successful new browser screenshot/video or live authenticated Render test is claimed. Local Chromium is missing its binary; its installer previously returned 403. The connected browser could not reach the local preview, and browser policy prevented observing the failed page. No policy workaround was attempted. The old, unverified /zones-specific browser helper was removed because it described an integration that is outside this patch.

Before acceptance, test the final SHA on Khoa's Mac with Phu's confirmed live Backend: open /map and the embedded warning map; expand global bulletins; verify active null end time, refresh after Admin deactivation, expired/forbidden account, and unchanged zone toggle/markers/popups. Capture these screens and record the deployed Backend SHA. These remain pending, rather than being represented by helper tests or old screenshots.

No merge or deploy is included.
