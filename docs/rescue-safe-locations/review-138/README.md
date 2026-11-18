# PR #138 follow-up to review of 6bd7d80

Branch: feature/rescue-safe-location-catalog. No Backend/Admin/Mobile/auth/SOS edits.

## Fixes

1. CatalogStore queues the exact selected ID while the list is refreshing.
   Success reads it from the new catalogue; failure reads it from retained data.
   Existing in-flight details interrupted by refresh also resume after failure.
   Only the latest selection survives; close, cancel and a newer list invalidate
   obsolete requests. A failed GET detail keeps the retry action available.
2. RescueGpsStore applies one timestamp gate across watchPosition and
   getCurrentPosition. Older samples and conflicting equal-time samples cannot
   replace the current point/time or invoke catalogue reads. Invalid timestamps
   are rejected rather than converted into a fictitious fresh Date.now(). A late
   manual response focuses the retained newer point, not the older sample.
3. Visual-map buffers and radar are OFF by default. Historical layer loading
   remains enabled-key-only; disabled layers are omitted from manual/automatic
   refresh. The circular reference layer is still available by checking its box.

## HIST scope, separately from catalogue

The HIST metadata popups from the earlier combined work remain in this PR as a
separate visual-map feature. They use public points/areas, exact ID joins and
escaped metadata, never current flood confirmation. This follow-up changes only
the default visibility of buffers in that map; it does not remove HIST popups or
change geometry. Reviewer should assess this scope separately from shelters.

## Executed checks

Environment: Linux x64 / Node 24.22.1 / TypeScript 6 / Vite 8.3.1.

- Lint: PASS, build: PASS (existing bundle-size advisory), diff check: PASS.
- Web tests: 74 PASS, 2 earlier optional live-capture tests SKIP, 0 failures.
  SAFE_CATALOG_LIVE_DIR and HIST_LIVE_DIR supplied captured public responses.
- Catalogue suite: 24 PASS, including its Render-response replay.

| Case | Source | Result |
|---|---|---|
| Select A then B during failed refresh -> GET B | API substitute | PASS |
| Queued detail failure -> retry same ID | API substitute | PASS |
| Close queued selection / newer list removes ID | API substitute | PASS |
| Interrupted detail resumes; late old detail ignored | API substitute | PASS |
| Manual fresh GPS then late old watch | GPS/API substitutes | PASS: point/time/origin/order remain new |
| Watch fresh then late old manual / invalid timestamp | GPS substitute | PASS |
| Buffers/radar absent from enabled keys -> no calls, force/cache | API substitute | PASS (existing layer suite) |
| No-GPS initial data, 0 distance, Maps URL, selected deletion/404 | API substitutes | PASS (existing suite) |
| Public Render list with no GPS | Render read-only HTTP | PASS 200 + actual parser |
| Public Render list with synthetic GPS / same-ID detail | Render read-only HTTP | PASS 200 + actual parser |

Fresh Render captures were obtained for this review; the synthetic GPS query is
not a device-GPS test. No JWT/password/device location was logged. No catalogue
records were created, edited or deleted. See render-read-check.json and logs.

## Not executed on a real browser

Cloud browser cannot reach the workspace localhost (ERR_CONNECTION_REFUSED in
prior checks). No new browser screenshot/video or Network acceptance is claimed.
No-GPS list/map, card/pin same ID, Google Maps click/destination, physical GPS
ordering/permission and responsive layout are still pending browser acceptance.
Real TEST Admin soft-delete -> Web refresh -> vanished card/pin/404 is also
pending; only the controller transitions above were exercised with substitutes.

Use the updated SHA with team-approved TEST data, sanitize Network output, and
record browser/device + screenshots before requesting merge. No develop merge
or deployment performed.
