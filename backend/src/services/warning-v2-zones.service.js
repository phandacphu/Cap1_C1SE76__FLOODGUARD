const { hash } = require("./flood-warning-v2-contract");
const { createGeometryNormalizer } = require("./warning-v2-geometry");
const { getFloodHistoryGeoJSON } = require("./flood-history.service");

function iso(value) {
  if (value === undefined || value === null) return null;
  try {
    let date;
    if (typeof value.toDate === "function") date = value.toDate();
    else if (value instanceof Date) date = value;
    else if (typeof value === "string") {
      const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
      if (!m) return null;
      const canonical = `${m[1]}.${(m[2] || "").padEnd(3, "0")}Z`;
      date = new Date(canonical);
      if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonical) return null;
    } else return null;
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch { return null; }
}
const label = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
function featureCollection(value) {
  if (value?.type !== "FeatureCollection" || !Array.isArray(value.features)) throw new Error("Invalid source layer");
  return value.features;
}
function createWarningZonesService({ db, loadLayer = getFloodHistoryGeoJSON, clock = () => Date.now() }) {
  const normalize = createGeometryNormalizer();
  async function feature(properties, input, diagnosticReason = null) {
    const result = diagnosticReason
      ? { geometry: null, geometryStatus: "invalid", reason: diagnosticReason }
      : await normalize(input);
    return { type: "Feature", geometry: result.geometry,
      properties: { ...properties, geometryStatus: result.geometryStatus }, diagnosticReason: result.reason };
  }
  async function adminAreas() {
    const snapshot = await db.collection("flood_areas").get();
    return Promise.all(snapshot.docs.filter((s) => !s.data().deletedAt && s.data().isDeleted !== true).map((s) => {
      const a = s.data(), group = a.areaType === "flood" ? "current_flood" : a.areaType === "low_lying" ? "low_lying" : null;
      return feature({ zoneId: `admin:${s.id}`, group, name: label(a.name), sourceKind: "admin_area", sourceId: s.id,
        source: label(a.source), recordedAt: iso(a.recordedAt), dataUpdatedAt: iso(a.updatedAt), datasetVersion: null },
      a.geometry, group ? null : "unclassified_area");
    }));
  }
  async function historicalAreas() {
    // Both pieces are needed: using points without overrides could revive a soft-deleted HIST.
    const [layer, snapshot] = await Promise.all([loadLayer("points"), db.collection("historical_flood_area_overrides").get()]);
    const originals = featureCollection(layer), overrides = new Map(snapshot.docs.map((s) => [s.id, s.data()]));
    const datasetVersion = hash(layer);
    return Promise.all(originals.filter((p) => !overrides.get(p.properties?.id)?.deletedAt).map((p) => {
      const sourceId = label(p.properties?.id);
      if (!sourceId) throw new Error("Historical source has no stable ID");
      const a = overrides.get(sourceId) || {}, original = p.properties || {};
      return feature({ zoneId: `history:${sourceId}`, group: "historical_flood", name: label(a.name ?? original.name),
        sourceKind: "historical_area", sourceId, source: label(a.source ?? original.source_url),
        recordedAt: iso(a.recordedAt ?? original.recordedAt), dataUpdatedAt: iso(a.updatedAt), datasetVersion },
      a.geometry ?? null);
    }));
  }
  async function radarAreas() {
    const layer = await loadLayer("radar"), originals = featureCollection(layer), datasetVersion = hash(layer);
    const byId = new Map();
    for (const original of originals) {
      const sourceId = hash(original.geometry ?? null), p = original.properties || {};
      // Repeated identical radar geometry has one canonical ID and one pin/shape.
      if (!byId.has(sourceId)) byId.set(sourceId, await feature({ zoneId: `radar:${sourceId}`, group: "low_lying",
        name: label(p.name), sourceKind: "radar", sourceId, source: label(p.source ?? p.source_url),
        recordedAt: iso(p.recordedAt), dataUpdatedAt: iso(p.updatedAt), datasetVersion }, original.geometry));
    }
    return [...byId.values()];
  }
  async function load() {
    const kinds = ["admin_area", "historical_area", "radar"];
    const results = await Promise.allSettled([adminAreas(), historicalAreas(), radarAreas()]);
    const byId = new Map(), diagnostics = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        diagnostics.push({ zoneId: null, sourceKind: kinds[i], reason: "source_unavailable" });
        continue;
      }
      for (const item of result.value) {
        const id = item.properties.zoneId;
        if (byId.has(id)) {
          const previous = byId.get(id);
          previous.geometry = null; previous.properties.geometryStatus = "invalid"; previous.diagnosticReason = "duplicate_zone_id";
        } else byId.set(id, item);
      }
    }
    const features = [...byId.values()].sort((a, b) => a.properties.zoneId.localeCompare(b.properties.zoneId)).map((f) => {
      if (f.diagnosticReason) diagnostics.push({ zoneId: f.properties.zoneId, sourceKind: f.properties.sourceKind, reason: f.diagnosticReason });
      return { type: "Feature", geometry: f.geometry, properties: f.properties };
    });
    diagnostics.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const evaluableZones = features.filter((f) => f.properties.geometryStatus === "valid").length;
    const coverage = { status: diagnostics.length ? (evaluableZones ? "partial" : "unavailable") : "complete",
      totalZones: features.length, evaluableZones, unassessableZones: diagnostics };
    return { zonesRevision: hash({ features, coverage }), generatedAt: new Date(clock()).toISOString(),
      coverage, geojson: { type: "FeatureCollection", features } };
  }
  return { load };
}
module.exports = { createWarningZonesService };
