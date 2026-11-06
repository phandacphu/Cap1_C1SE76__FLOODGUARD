# CCF-56 and CCF-57 verification

Checked on 2026-11-06 after merging develop bdf64a68 into the existing PR branch.

## Implemented

- Keep existing Admin user/flood-area and Rescue list/detail routes when resolving App.tsx.
- Shared /map allows ADMIN and RESCUE_STAFF. /admin/map allows ADMIN only. Resident/anonymous are handled by the existing ProtectedRoute.
- Use configured API_URL and the exact success/data.floodAreas and data.floodAlerts envelopes. Invalid payloads fail explicitly; empty arrays are valid.
- Validate all vertices (finite numbers, coordinate ranges, at least three distinct points); reject invalid geometry as a whole.
- Default to active areas, distinguish inactive areas using dashed gray polygons, escape popup content.
- Keep stale labels and last successful load time through failed refresh and retry; remove labels only on successful refresh. Area active status is not a real-time flood confirmation.
- Only request flood areas and, for Admin, active alerts. Public requests do not send tokens. 60-second in-memory cache and in-flight deduplication; no polling. Manual refresh bypasses cache.
- Standard OSM tile URL, visible tile failure state, actual tile redraw on retry, ResizeObserver and lifecycle cleanup.

## Executed

From web/: npm ci; npm run lint; npm run build; node --test tests/floodAreaService.test.cjs.

Lint passed. Build passed with a bundle-size warning (>500 kB), not zero warnings. Four service test groups passed, covering correct envelope, empty and invalid payload/JSON, HTTP 401/403/500, offline/recovery, cache/concurrent requests, active alert count and invalid geometry.
Full command output is stored beside this file.

## Blocked and not claimed as PASS

Browser test launch failed before any page could be opened: Chromium reported socket() failed: Operation not permitted (1). Therefore no UI, tile, Network screenshot/video or browser route regression evidence was produced. No real Admin/Rescue credentials were available. Service tests mock HTTP responses and do not establish real authentication or production tile availability.

## Required browser acceptance before merge

- Sign in separately as Admin and Rescue; open map via sidebar, inspect header and navigate back. Check /admin/users, /admin/flood-areas, /rescue/sos and /rescue/sos/:id still work.
- Inspect Network on map: /flood-areas, plus /flood-alerts/active only for Admin; no overview/users/SOS/health fan-out. Pan/zoom and filters must not fetch data.
- Verify OSM tiles, polygon position, popup name/severity/status/source and inactive dashed styling.
- Test empty, 401/403/500, invalid JSON/schema/geometry and offline. After prior success, stale label/time remains visible until successful retry.
- Block OSM tiles, verify tile warning and retry when unblocked.
- Check anonymous redirects to login, Resident denied, Rescue denied /admin/map, both web roles allowed /map.
- Attach actual map + Network screenshots/video and logs for the tested head commit. Leader reviews and merges; leave Jira completion pending until acceptance.
