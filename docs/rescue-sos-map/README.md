# CCF-105 / CCF-181 — PR #137 review follow-up

Branch: feature/rescue-sos-map-layers. Review baseline: 06550b6.

## Final scope

- /rescue/sos is SOS-only: no area, alert, historical points/HIST, buffer or radar
  data imports/requests. Uses the existing SOS v2 serial polling and shared
  filtered list for map/table. Active/red, rescued/green, legacy_other/gray.
  Missing GPS stays in table; popup and directions use latest location.
- Area classification/filtering, active alerts and all historical layers live
  in /map (existing Admin /admin/map ordinary-area behavior preserved).
- Visual-map buffers and radar default off. They fetch only when enabled;
  disabled layers are excluded from manual/automatic refresh. Cache lasts 60s,
  toggle off/on reuses the exact snapshot/time, concurrent loads deduplicate.
  Empty successful HIST snapshots replace deleted data. Failed loads retain
  prior snapshot/time and show a stale-data warning. Hidden tab pauses polling.
- Area/alert API snapshots carry fetchedAt from successful HTTP reads. Cache hits
  reuse this time rather than resetting it to render/read time. Failed refresh
  does not replace cached timestamp. Historical data remains reference only.
- SOS v2 session/completion logic from dc740ea is unchanged.

## Verification (2026-11-14)

Environment: Linux x64, Node 24.22.1, Vite 8.3.1, TypeScript 6, local fixture tests.

- Lint: passed (lint.txt).
- Build: passed (build.txt); existing >500 kB bundle advisory.
- All Web tests: 43 passed, zero failures, 2 optional live-payload fixture tests
  skipped because captured fixture files are not present (tests.txt).
- No new authenticated Render workflow was performed.
- git diff --check: passed.

Added executable tests: alert/area cached timestamp, failed refresh time retention,
opening without buffer/radar, forced refresh with layers off, cache toggle reuse,
expiry, deduplication and failure preservation. Existing 25 SOS v2 tests still
cover GPS/directions reconciliation, completed state, expired session and lost
PATCH response. Historical parser and other Web regressions are included.

## Browser / Render acceptance not yet completed

No actual browser Network trace or UI success screenshot is claimed. Local Vite
started at 127.0.0.1:5187; installed Chromium failed at process_singleton_posix
socket() with Operation not permitted. Cloud browser returned
net::ERR_CONNECTION_REFUSED for that localhost address. No login/token was logged.

Still required with team-agreed TEST SOS/account, all against the new PR head:

| Case | Status |
|---|---|
| Browser Network: /rescue/sos only SOS + map tiles | NOT RUN; browser blocked |
| Browser Network: /map no buffers/radar while off; enable/cache/refresh | NOT RUN; browser blocked |
| Same TEST ID: Resident GPS -> table/marker/detail/directions | NOT RUN; no agreed TEST ID/credentials available |
| Direct completion -> active row/marker removed; rescued history/actor/time | NOT RUN; same dependency |
| Expired session and lost PATCH response in browser | NOT RUN; automated regressions passed |
| MapTiler valid key, popups/panning/filters, responsive layout | NOT RUN; browser blocked |

Please record sanitized paths/method/status and screenshots on a team browser;
do not include Authorization, tokens, passwords or real residents' locations.
No live records were modified. No merge/deploy performed.


## Collocated SOS follow-up

The location counter counts requests with valid GPS, not unique points. Requests
with exactly equal coordinates are now grouped at their real coordinate, with a
permanent N SOS label and a popup containing a separate ID, detail link, GPS time
and latest-coordinate directions link for each request. No artificial GPS offset
is applied. Different coordinates remain separate; the explicit fit-all action
includes every valid coordinate and never runs automatically during polling.

Added tests: six distinct SOS IDs at one GPS point remain six popup records;
a GPS change moves the same ID to its new group and updates directions without
removing another SOS or the missing-GPS table record. Tests: 43 passed, 2 optional
live-fixture tests skipped. Lint/build passed; stored logs normalized with trailing
whitespace and trailing blank lines removed. git diff --check passed.

Not verified: actual six SOS from the user's screenshot, live popup clicks,
Resident GPS update -> direct rescue completion -> rescued-group history. No
team-agreed TEST ID or authenticated session was available. Prior browser blockers
remain; no image/video or successful live acceptance is claimed. The code tests
use explicit TEST fixtures and are not substitutes for that final acceptance.
