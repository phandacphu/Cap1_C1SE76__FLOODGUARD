const { Timestamp } = require("firebase-admin/firestore");
const { isDeepStrictEqual } = require("node:util");
const { db } = require("../config/firebase");
const {
  authorizeAdmin,
  ensureActiveAdmin,
  ensureAllowedBody,
  normalizeDocumentId,
} = require("./admin-flood-area.service");
const { normalizeFloodAreaData } = require("./flood-area.service");
const { getFloodHistoryGeoJSON } = require("./flood-history.service");
const { logAuditEvent } = require("./audit-logging.service");

const COLLECTION = "historical_flood_area_overrides";

function notFound() {
  const error = new Error("Historical flood area not found");
  error.statusCode = 404;
  error.code = "HISTORICAL_FLOOD_AREA_NOT_FOUND";
  return error;
}

async function getOriginalPoint(id) {
  const { features } = await getFloodHistoryGeoJSON("points");
  const point = features.find((feature) => feature.properties.id === id);
  if (!point) throw notFound();
  return point;
}

function toArea(point, override) {
  const { id, name, source_url: sourceUrl } = point.properties;
  const [longitude, latitude] = point.geometry.coordinates;
  return {
    id,
    name: override?.name ?? name,
    description: override?.description ?? null,
    areaType: override?.areaType ?? null,
    source: override?.source ?? (sourceUrl || null),
    geometry: override?.geometry ?? null,
    referencePoint: { latitude, longitude },
    sourceUrl: sourceUrl || null,
    updatedAt: override?.updatedAt?.toDate().toISOString() ?? null,
  };
}

async function listVisibleHistoricalAreas() {
  const [geojson, snapshot] = await Promise.all([
    getFloodHistoryGeoJSON("points"),
    db.collection(COLLECTION).get(),
  ]);
  const overrides = new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));
  return geojson.features
    .filter((point) => !overrides.get(point.properties.id)?.deletedAt)
    .map((point) => ({ point, area: toArea(point, overrides.get(point.properties.id)) }));
}

function signedDoubleArea(points) {
  const origin = points[0];
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum +
      (point.longitude - origin.longitude) * (next.latitude - origin.latitude) -
      (next.longitude - origin.longitude) * (point.latitude - origin.latitude);
  }, 0);
}

async function getHistoricalLayer(layer) {
  if (layer !== "points" && layer !== "areas") return getFloodHistoryGeoJSON(layer);

  const entries = await listVisibleHistoricalAreas();
  const features = layer === "points"
    ? entries.map(({ point, area }) => ({
      ...point,
      properties: {
        ...point.properties,
        name: area.name,
        description: area.description,
        areaType: area.areaType,
        source: area.source,
      },
    }))
    : entries.filter(({ area }) => area.geometry).map(({ area }) => {
      const { points } = area.geometry;
      const ring = points.map(({ latitude, longitude }) => [longitude, latitude]);
      if (signedDoubleArea(points) < 0) ring.reverse();
      return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
        properties: {
          id: area.id,
          name: area.name,
          description: area.description,
          areaType: area.areaType,
          source: area.source,
          layer_type: "historical_admin_area",
          display_only: true,
          current_flood_alert: false,
          verified_flood_polygon: false,
        },
      };
    });
  return { type: "FeatureCollection", features };
}

async function listHistoricalAreasForAdmin(actorId) {
  await authorizeAdmin(actorId);
  const entries = await listVisibleHistoricalAreas();
  return entries.map(({ area }) => area);
}

async function getHistoricalAreaForAdmin(actorId, id) {
  await authorizeAdmin(actorId);
  const point = await getOriginalPoint(id);
  const override = (await db.collection(COLLECTION).doc(id).get()).data();
  if (override?.deletedAt) throw notFound();
  return toArea(point, override);
}

function normalizeHistoricalArea(data) {
  try {
    const normalized = normalizeFloodAreaData(data);
    const { points } = normalized.geometry;
    const isClosed = isDeepStrictEqual(points[0], points.at(-1));
    if (isClosed) points.pop();
    const distinct = new Set(points.map(({ latitude, longitude }) => `${latitude},${longitude}`));
    if (distinct.size < 3 || distinct.size !== points.length) {
      throw new Error("Historical polygon must have at least three distinct vertices and no repeated vertices");
    }
    if (signedDoubleArea(points) === 0) {
      throw new Error("Historical polygon must enclose an area");
    }
    return normalized;
  } catch (error) {
    error.statusCode = 400;
    error.code = "INVALID_HISTORICAL_FLOOD_AREA";
    throw error;
  }
}

async function auditChange(actorId, id, action, changedFields) {
  await logAuditEvent({
    actor: { id: actorId, role: "admin" },
    target: { type: "historical_flood_area", id },
    action: `historical_flood_area.${action}`,
    metadata: { source: "api", outcome: "success", changedFields },
  });
}

// Description/source-only updates must not require an invented historical polygon.
// All other edits keep the strict full geometry/areaType validation.
function normalizeHistoricalMetadataPatch(patch) {
  const result = {};
  if (Object.hasOwn(patch, "description")) {
    if (patch.description !== null && typeof patch.description !== "string") {
      const error = new Error("Historical description must be a string or null");
      error.statusCode = 400;
      error.code = "INVALID_HISTORICAL_FLOOD_AREA";
      throw error;
    }
    result.description = typeof patch.description === "string" ? patch.description.trim() || null : null;
  }
  if (Object.hasOwn(patch, "source")) {
    if (typeof patch.source !== "string" || !patch.source.trim()) {
      const error = new Error("Historical source must be a non-empty string");
      error.statusCode = 400;
      error.code = "INVALID_HISTORICAL_FLOOD_AREA";
      throw error;
    }
    result.source = patch.source.trim();
  }
  return result;
}

async function updateHistoricalArea(actorId, id, patch) {
  const adminId = normalizeDocumentId(actorId);
  ensureAllowedBody(patch);
  const metadataOnly = Object.keys(patch).every((field) => field === "description" || field === "source");
  const metadata = metadataOnly ? normalizeHistoricalMetadataPatch(patch) : null;
  const point = await getOriginalPoint(id);
  const actorRef = db.collection("users").doc(adminId);
  const overrideRef = db.collection(COLLECTION).doc(id);

  const { area, changedFields } = await db.runTransaction(async (transaction) => {
    ensureActiveAdmin(await transaction.get(actorRef));
    const override = (await transaction.get(overrideRef)).data();
    if (override?.deletedAt) throw notFound();
    const current = toArea(point, override);
    const updated = metadataOnly ? metadata : normalizeHistoricalArea({ ...current, ...patch });
    const changedFields = Object.keys(updated).filter(
      (field) => !isDeepStrictEqual(updated[field], current[field]),
    );
    if (changedFields.length === 0) return { area: current, changedFields };

    // Preserve existing overrides and geometry when only metadata is edited.
    const next = { ...(metadataOnly ? override : {}), ...updated, updatedAt: Timestamp.now() };
    transaction.set(overrideRef, next);
    return { area: toArea(point, next), changedFields };
  });
  if (changedFields.length) await auditChange(adminId, id, "update", changedFields);
  return area;
}

async function deleteHistoricalArea(actorId, id) {
  const adminId = normalizeDocumentId(actorId);
  await getOriginalPoint(id);
  const actorRef = db.collection("users").doc(adminId);
  const overrideRef = db.collection(COLLECTION).doc(id);

  const { deletedAt, changed } = await db.runTransaction(async (transaction) => {
    ensureActiveAdmin(await transaction.get(actorRef));
    const override = (await transaction.get(overrideRef)).data();
    if (override?.deletedAt) return { deletedAt: override.deletedAt, changed: false };

    const deletedAt = Timestamp.now();
    transaction.set(overrideRef, { deletedAt, deletedBy: adminId }, { merge: true });
    return { deletedAt, changed: true };
  });
  if (changed) await auditChange(adminId, id, "delete", []);
  return { id, deleted: true, deletedAt: deletedAt.toDate().toISOString() };
}

module.exports = {
  getHistoricalLayer,
  listHistoricalAreasForAdmin,
  getHistoricalAreaForAdmin,
  updateHistoricalArea,
  deleteHistoricalArea,
};
