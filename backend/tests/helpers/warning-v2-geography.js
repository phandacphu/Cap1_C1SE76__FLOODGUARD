const NOW = Date.parse("2026-11-22T01:00:30.000Z");
const EARTH_RADIUS_M = 6371008.8;
const square = (x = 0, y = -0.05, size = 0.05) => ({ type: "Polygon",
  coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] });
function adminGeometry(geometry = square()) {
  return { type: "polygon", points: geometry.coordinates[0].slice(0, -1).map(([longitude, latitude]) => ({ latitude, longitude })) };
}
const collection = (features = []) => ({ type: "FeatureCollection", features });
const feature = (geometry, properties = {}) => ({ type: "Feature", geometry, properties });
const layerLoader = ({ points = collection(), radar = collection() } = {}) => async (kind) => {
  if (kind === "points") return points;
  if (kind === "radar") return radar;
  throw new Error("Buffer/reference layer must not be loaded for warning evaluation");
};
const sample = (overrides = {}) => ({ sequence: 1, availability: "available", reason: null,
  location: { latitude: -0.025, longitude: 0.025 }, capturedAt: new Date(NOW - 10000).toISOString(), accuracyM: 20, ...overrides });
function zones(features = [square()], { status = "complete", unassessableZones = [] } = {}) {
  return { zonesRevision: "TEST-REVISION", generatedAt: new Date(NOW).toISOString(),
    coverage: { status, totalZones: features.length, evaluableZones: features.length, unassessableZones },
    geojson: collection(features.map((geometry, i) => feature(geometry, { zoneId: `test:${i}`, group: "current_flood", name: `TEST ${i}`,
      geometryStatus: "valid", sourceKind: "test", source: null, recordedAt: null }))) };
}
module.exports = { NOW, EARTH_RADIUS_M, square, adminGeometry, collection, feature, layerLoader, sample, zones };
