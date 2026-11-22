const { warningError } = require("./flood-warning-v2-contract");
const { relationToGeometry } = require("./warning-v2-geometry");
const MAX_AGE_MS = 60000, MAX_ACCURACY_M = 100;
function invalid() { throw warningError("INVALID_LOCATION_DATA", "Invalid location sample", 400); }
function gpsBody(body, now = Date.now()) {
  const keys = ["sequence", "availability", "reason", "location", "capturedAt", "accuracyM"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype ||
      Object.keys(body).length !== keys.length || Object.keys(body).some((key) => !keys.includes(key)) ||
      !Number.isSafeInteger(body.sequence) || body.sequence < 1 || !Number.isFinite(now)) invalid();
  if (body.availability === "unavailable") {
    if (!["permission_denied", "location_disabled", "no_fix"].includes(body.reason) || body.location !== null ||
        body.capturedAt !== null || body.accuracyM !== null) invalid();
    return { sequence: body.sequence, availability: body.availability, reason: body.reason,
      location: null, capturedAt: null, accuracyM: null };
  }
  const p = body.location;
  if (body.availability !== "available" || body.reason !== null || !p || typeof p !== "object" || Array.isArray(p) ||
      Object.keys(p).length !== 2 || !Number.isFinite(p.latitude) || Math.abs(p.latitude) > 90 ||
      !Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180 ||
      (body.accuracyM !== null && (!Number.isFinite(body.accuracyM) || body.accuracyM < 0))) invalid();
  const match = typeof body.capturedAt === "string" && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(body.capturedAt);
  if (!match) invalid();
  const canonical = `${match[1]}.${(match[2] || "").padEnd(3, "0")}Z`, parsed = new Date(canonical);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical || parsed.getTime() > now) invalid();
  return { sequence: body.sequence, availability: "available", reason: null,
    location: { latitude: p.latitude, longitude: p.longitude }, capturedAt: canonical, accuracyM: body.accuracyM };
}

// Pure engine used by the device-bound upload/read API. It does not store GPS or send push itself.
function evaluatePosition({ sample = null, zones, activeAlertIds = [], now = Date.now(), installationId = null, bindingId = null }) {
  const captured = sample?.capturedAt ? Date.parse(sample.capturedAt) : NaN;
  const coverage = { ...zones.coverage, unassessableZones: [...zones.coverage.unassessableZones] };
  const result = { installationId, bindingId, sequence: sample?.sequence ?? null,
    location: sample?.location ?? null, capturedAt: sample?.capturedAt ?? null, receivedAt: sample?.receivedAt ?? null,
    accuracyM: sample?.accuracyM ?? null, validUntil: Number.isFinite(captured) ? new Date(captured + MAX_AGE_MS).toISOString() : null,
    evaluatedAt: new Date(now).toISOString(), zonesRevision: zones.zonesRevision, status: "unknown", reason: null,
    coverage, matches: [], activeAlertIds: [...new Set(activeAlertIds)] };
  const unknown = (reason) => ({ ...result, status: "unknown", reason, matches: [] });
  if (!activeAlertIds.length) return unknown("no_active_alert");
  if (!sample) return unknown("no_location");
  if (sample.availability !== "available") return unknown(sample.reason || "no_location");
  if (!Number.isFinite(captured) || captured > now) return unknown("invalid_location_time");
  if (now - captured > MAX_AGE_MS) return unknown("stale_location");
  if (!Number.isFinite(sample.accuracyM) || sample.accuracyM > MAX_ACCURACY_M || sample.accuracyM < 0) return unknown("poor_accuracy");
  if (coverage.status === "unavailable") return unknown("zone_data_unavailable");
  if (!zones.geojson.features.length) return unknown(coverage.status === "complete" ? "no_zones" : "incomplete_zone_data");
  for (const feature of zones.geojson.features) {
    if (feature.properties.geometryStatus !== "valid" || !feature.geometry) continue;
    try {
      const relation = relationToGeometry(sample.location, feature.geometry);
      if (relation.relation !== "far") {
        const p = feature.properties;
        result.matches.push({ zoneId: p.zoneId, group: p.group, name: p.name, relation: relation.relation,
          distanceToBoundaryM: relation.distanceToBoundaryM, source: p.source, recordedAt: p.recordedAt });
      }
    } catch {
      coverage.evaluableZones--;
      coverage.unassessableZones.push({ zoneId: feature.properties.zoneId, sourceKind: feature.properties.sourceKind, reason: "geometry_evaluation_failed" });
      coverage.status = coverage.evaluableZones > 0 ? "partial" : "unavailable";
    }
  }
  result.matches.sort((a, b) => (a.relation === "inside" ? 0 : 1) - (b.relation === "inside" ? 0 : 1) ||
    (a.distanceToBoundaryM ?? 0) - (b.distanceToBoundaryM ?? 0) || a.zoneId.localeCompare(b.zoneId));
  if (result.matches.length) { result.status = result.matches[0].relation; return result; }
  if (coverage.status !== "complete") return unknown(coverage.status === "unavailable" ? "zone_data_unavailable" : "incomplete_zone_data");
  return { ...result, status: "far", reason: null };
}
module.exports = { MAX_AGE_MS, MAX_ACCURACY_M, gpsBody, evaluatePosition };
