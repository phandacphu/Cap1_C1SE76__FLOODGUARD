# Resident Mobile: Admin-drawn HIST polygons

Baseline: develop 655829c. Branch: feature/mobile-historical-areas.

Uses existing FloodHistoryApi.getAreas / FloodHistoryRepository.getAreas:
GET /api/flood-history/areas, public, data.layer=areas, data.geojson.
No API, Backend, Web, or Rescue changes.

The Resident ViewModel loads HIST polygons independently on initial load and map
refresh. Successful snapshots replace the complete layer, including an empty list
when all polygons have been deleted. Points refresh through their existing source.
Failed HIST loads retain previously loaded geometry and timestamp with an error;
retry is available and concurrent requests for this source are suppressed.

Google Maps renders HIST polygons separately from ordinary Admin and radar layers,
including interior rings. Flood is yellow; low_lying uses the existing red map
color. The HIST layer has its own visibility toggle and source status. Coordinates
are mapped from GeoJSON [longitude, latitude]. Metadata is retained. Historical
geometry always has currentFloodAlert=false and never feeds current alert logic.

## Automated validation

Added mapper tests for coordinate order, metadata, both area types, interior rings,
empty snapshots, invalid geometry and duplicate IDs. Added ViewModel tests for
refresh/edit/delete, preserved radar/Admin data, failure/cache/recovery,
request deduplication, wrong-layer responses and toggling without network calls.

- git diff --check: passed.
- Gradle unit tests: NOT RUN; wrapper download failed before compilation with
  java.net.SocketException: Network is unreachable (Gradle 9.6.0).
- assembleDebug: NOT RUN; same wrapper download blocker.
- Android emulator/device and live Web-to-Mobile synchronization: NOT TESTED.

Run in an Android development environment:

```sh
cd mobile
sh gradlew :app:testDebugUnitTest --tests 'com.example.floodguard.ui.screens.map.*'
sh gradlew :app:assembleDebug
```

## Device acceptance still required

Use only agreed TEST HIST records. Record commit SHA, device/Android version,
API environment, HIST ID, screenshots before/after and observed results.

1. Admin draws and saves TEST HIST polygon; Resident reload shows matching
   geometry, areaType/color and retained point.
2. Admin edits the same polygon; reload shows new geometry, no previous overlay.
3. Admin deletes TEST HIST; reload removes that point and its polygon.
4. Ordinary flood/low_lying Admin polygons, points, radar and existing buffer
   controls still work. HIST visibility does not hide other layer types.
5. Network failure retains cached HIST with stale/error indication; retry after
   recovery replaces the layer. Empty successful responses clear it.
6. Confirm HIST remains a historical reference, not a current flood alert.

No live records were created, edited or deleted during implementation.
