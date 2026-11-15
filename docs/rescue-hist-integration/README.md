# Rescue Web HIST metadata integration

Branch: feature/CCF-105-181-rescue-hist-details. Follow-up after PR #137 merged.
Integrated develop 1b79f08 without conflicts. Web source tree unchanged by that
merge; its incoming changes are team-owned Mobile work, not part of this diff.
Scope: Rescue visual map and its reader/cache tests only. No Backend, Admin UI,
Mobile, SOS flow or public API contract changes.

## Behavior

- Points and drawn areas read the public HIST APIs; metadata remains attached to
  each GeoJSON feature. Points and polygons now open detail popups.
- Popup contains ID, exact API name/description/source, areaType, reference point
  coordinates (latitude, longitude), polygon first vertex and vertex count where
  applicable, fetch timestamp and historical-only disclaimer.
- Description fallback is used only for null/blank/missing text. Every API field
  is HTML-escaped. Sources are text, never arbitrary clickable URLs/HTML.
- Polygon reference point joins by properties.id only. No same-name/nearby-GPS
  matching. Polygon metadata comes from its own API feature. Missing matching
  point is explicit; stale point/area responses mark the popup stale.
- Metadata is validated before caching: bad/duplicate/missing IDs or invalid
  fields fail that source without replacing prior successful data/time.
- Manual enabled-layer refresh bypasses cache. Successful empty snapshots clear
  features. Errors keep previous data with source errors, never mock fallback.
- Historical points/areas use an interactive pane; passive buffers/radar remain
  below existing ordinary Admin regions. Buffers/radar still fetch only on enable.
- All HIST labels remain reference-only, never current flood confirmation.

## Verification

Lint/build passed; 50 Web tests passed, 2 optional older capture tests skipped.
This includes the new live points/areas parser + metadata comparison using actual
public Render responses obtained on 2026-11-15 (public-api-check.json). All four
current polygon IDs match a point with identical name/description/source/type.
No Admin edits/deletes or real SOS mutations performed. Captured public data is
used only for verification; runtime always reads API.

git diff --check passed. Test/build/lint logs are attached and normalized.

Browser popup click, screenshot and Admin-save/edit/delete -> browser reload
acceptance NOT RUN: browser unavailable for local workspace (previous Chromium
permission / cloud-localhost connection blockers). Automated helper/cache tests
cover metadata edits, empty deletion, error retention, exact-ID joins, fallback
and HTML escaping. They are not claimed as UI or cross-platform acceptance.

Four Web Admin reference screenshots are optional additional comparison evidence;
implementation and public API verification did not wait for them. Team-agreed
four-ID cross-platform acceptance still needs each client owner to run it.


## Keep historical point appearance

Original HIST point coordinates and red historicalFloodIcon are unchanged. Drawn
HIST polygons overlay the base map in pane 410; the original points remain above
them in pane 430, so overlapping polygons cannot hide pins or consume their clicks.
Buffers/radar remain in passive pane 390. Metadata popups are retained.


## Requested circle + polygon presentation

Historical buffers now default ON at the user's explicit request to retain the
old circular reference areas while adding Admin-drawn polygons. Points and HIST
areas remain on; radar remains off. Buffer requests on opening are therefore
intentional, for the visibly enabled checkbox. Turning off buffers excludes them
from subsequent refreshes; no invented client-side circles or altered GPS/vertices.
This changes the earlier default-off buffer choice; radar is still lazy/off.
