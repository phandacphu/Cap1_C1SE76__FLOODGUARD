# Rescue Web — corrections after review of 19314b8

Base under review: `19314b8061b030e495102b31f9afeac0d3392d39`.
Target branch: `feat/khoa-embed-warning-map`.
Obtain the exact correction SHA with `git rev-parse HEAD`; the final delivery names that SHA.

## Changes

- Restore all Rescue warning dependencies, including the provider, resource hook, feedback, session recovery action, V2 parsers/API, explicit development fixtures, and coverage presentation. These files are committed, not merely present in an untracked local workspace.
- Restore App.tsx's original route formatting. Preserve all existing Admin and Rescue routes and their role guards; keep warning routes protected for Rescue. Existing Admin regression assertions remain intact.
- Reuse FloodMapView for full and embedded displays. Rescue boundaries come from authenticated `GET /flood-alerts/zones`; render current_flood, historical_flood and low_lying in the existing Leaflet layer group. Preserve tile/camera setup, zone toggle, popup, history pin references and the embedded layout.
- Historical points/buffers are optional reference layers, never substitutes for missing V2 outlines. Historical area/radar outlines come from /zones to avoid drawing duplicate or contradictory boundary sets. Reference overlays are removed after a zones 401/403.
- Rescue active bulletins use authenticated GET /flood-alerts/active, scoped to the current JWT/account. Global bulletins are not grouped by areaId or ranked by severity. Admin map uses its existing authenticated V2 warning source.
- Remove unused V1 warning methods from the public floodAreaService. Its public /flood-areas geometry cache remains for Admin map geometry only.
- Handle partial/unavailable coverage and per-source diagnostics. Failed refresh preserves labeled stale data; 401/403/404 clears unauthorized/missing resource data. Session changes remount map state; old/aborted requests cannot overwrite the new identity.

## Automated validation

Working-tree lint and production build passed before the clean-checkout verification.
The full `.mjs` + `.cjs` suite passed: 179 tests, 175 passed, 4 explicitly skipped, 0 failed.
The integration test uses the repository's actual Express V2 router, JWT middleware, service and geometry normalizer with an isolated in-memory database. It does not write to Render, Firestore, or the real Backend.

Covered: multiple active bulletins; endAt=null; GMT+7; exact detail ID and 404; malformed V1 rejection; 401/403; refresh after server deactivation; aborted/late responses; source/account replacement; three zone groups; Polygon holes/MultiPolygon; partial/unavailable coverage and source failures; safe popup text; layer toggle/camera/cleanup; existing Dashboard count helpers, Admin routes, SOS/history/map/directions, and Safe Locations regressions.

Reproduce from a clean checkout of the final SHA:

```bash
npm --prefix web ci --no-audit --no-fund
npm --prefix backend ci --ignore-scripts --no-audit --no-fund
npm --prefix web run lint
npm --prefix web run build
node --test web/tests/*.mjs web/tests/*.cjs
```

Backend dependency installation is necessary for the isolated HTTP integration test. No Backend source changes are included.

## Not verified / remaining acceptance evidence

- No successful visual browser run, screenshot or video is claimed. The installed Chromium launcher has no browser binary; Playwright's download attempt returned HTTP 403. `verify-rescue-warning-ui.cjs` is provided as a follow-up helper and is not counted as passed.
- No real Rescue/Admin credential was supplied. Live authenticated Render behavior, deployed Backend SHA, real MapTiler key/tiles and cross-device changes have not been verified.
- The four existing skipped tests require captured live historical/flood-area payloads or optional environment inputs; they are not counted as passes. See the test log for exact skip names.
- Before merge, capture list/detail/map/filter/error screenshots on the final correction commit and run live account acceptance checks with Phu's confirmed deployment.

No merge or deploy has been performed. Real Backend source and data remain unchanged.
