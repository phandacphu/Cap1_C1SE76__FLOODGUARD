const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const { isDeepStrictEqual } = require("node:util");

const {
  FLOOD_AREAS_COLLECTION,
  normalizeFloodAreaData,
} = require("./flood-area.service");

const {
  logAuditEvent,
} = require("./audit-logging.service");

const ALLOWED_AREA_FIELDS = [
  "name",
  "description",
  "geometry",
  "severity",
  "status",
  "source",
];

function areaError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeDocumentId(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().includes("/") ||
    value.trim() === "." ||
    value.trim() === ".." ||
    Buffer.byteLength(value.trim(), "utf8") > 1500
  ) {
    throw areaError(
      "INVALID_ADMIN_AREA_ID",
      "Invalid document ID",
      400,
    );
  }

  return value.trim();
}

function ensureActiveAdmin(userDoc) {
  if (!userDoc.exists) {
    throw areaError(
      "ADMIN_AREA_AUTH_REQUIRED",
      "Authenticated user no longer exists",
      401,
    );
  }

  const user = userDoc.data();

  if (user.isActive !== true) {
    throw areaError(
      "ADMIN_AREA_ACCOUNT_INACTIVE",
      "Account is inactive",
      403,
    );
  }

  if (user.role !== "admin") {
    throw areaError(
      "ADMIN_AREA_ROLE_FORBIDDEN",
      "Only admins can manage flood areas",
      403,
    );
  }
}

async function authorizeAdmin(actorId) {
  const normalizedId = normalizeDocumentId(actorId);

  const userDoc = await db
    .collection("users")
    .doc(normalizedId)
    .get();

  ensureActiveAdmin(userDoc);

  return normalizedId;
}

function ensureAllowedBody(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) !== Object.prototype
  ) {
    throw areaError(
      "INVALID_ADMIN_AREA_DATA",
      "Flood area body must be an object",
      400,
    );
  }

  const fields = Object.keys(body);

  if (
    fields.length === 0 ||
    fields.some(
      (field) => !ALLOWED_AREA_FIELDS.includes(field),
    )
  ) {
    throw areaError(
      "INVALID_ADMIN_AREA_DATA",
      "Provide only name, description, geometry, severity, status or source",
      400,
    );
  }

  if (Object.hasOwn(body, "geometry")) {
    const geometry = body.geometry;

    if (
      !geometry ||
      typeof geometry !== "object" ||
      Array.isArray(geometry) ||
      Object.keys(geometry).some(
        (field) => !["type", "points"].includes(field),
      )
    ) {
      throw areaError(
        "INVALID_ADMIN_AREA_DATA",
        "Geometry must contain only type and points",
        400,
      );
    }

    if (Array.isArray(geometry.points)) {
      for (const point of geometry.points) {
        if (
          !point ||
          typeof point !== "object" ||
          Array.isArray(point) ||
          Object.keys(point).some(
            (field) =>
              !["latitude", "longitude"].includes(field),
          )
        ) {
          throw areaError(
            "INVALID_ADMIN_AREA_DATA",
            "Geometry points must contain only latitude and longitude",
            400,
          );
        }
      }
    }
  }
}

function normalizeAreaInput(data) {
  try {
    return normalizeFloodAreaData(data);
  } catch (error) {
    throw areaError(
      "INVALID_ADMIN_AREA_DATA",
      error.message,
      400,
    );
  }
}

function toIsoString(value) {
  return value && typeof value.toDate === "function"
    ? value.toDate().toISOString()
    : null;
}

function toClientArea(areaDoc) {
  const area = areaDoc.data();

  return {
    id: areaDoc.id,
    name: area.name ?? null,
    description: area.description ?? null,
    geometry: area.geometry ?? null,
    severity: area.severity ?? null,
    status: area.status ?? null,
    source: area.source ?? null,
    createdAt: toIsoString(area.createdAt),
    updatedAt: toIsoString(area.updatedAt),
  };
}

function ensureAreaExists(areaDoc) {
  if (!areaDoc.exists) {
    throw areaError(
      "ADMIN_AREA_NOT_FOUND",
      "Flood area not found",
      404,
    );
  }
}

async function auditAreaChange(
  actorId,
  areaId,
  action,
  changedFields,
) {
  await logAuditEvent({
    actor: {
      id: actorId,
      role: "admin",
    },
    action,
    target: {
      type: "flood_area",
      id: areaId,
    },
    metadata: {
      source: "api",
      outcome: "success",
      changedFields,
    },
  });
}

async function listFloodAreasForAdmin(actorId) {
  await authorizeAdmin(actorId);

  const snapshot = await db
    .collection(FLOOD_AREAS_COLLECTION)
    .get();

  return snapshot.docs
    .map(toClientArea)
    .sort((first, second) =>
      first.id.localeCompare(second.id),
    );
}

async function getFloodAreaDetailForAdmin(
  actorId,
  areaId,
) {
  await authorizeAdmin(actorId);

  const normalizedAreaId = normalizeDocumentId(areaId);

  const areaDoc = await db
    .collection(FLOOD_AREAS_COLLECTION)
    .doc(normalizedAreaId)
    .get();

  ensureAreaExists(areaDoc);

  return toClientArea(areaDoc);
}

async function createFloodAreaForAdmin(actorId, body) {
  const normalizedActorId = normalizeDocumentId(actorId);

  ensureAllowedBody(body);
  const data = normalizeAreaInput(body);

  const actorRef = db
    .collection("users")
    .doc(normalizedActorId);

  // Allocate the ID once, outside the retryable callback.
  const areaRef = db
    .collection(FLOOD_AREAS_COLLECTION)
    .doc();

  await db.runTransaction(async (transaction) => {
    const actorDoc = await transaction.get(actorRef);
    ensureActiveAdmin(actorDoc);

    transaction.create(areaRef, {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await auditAreaChange(
    normalizedActorId,
    areaRef.id,
    "flood_area.create",
    ALLOWED_AREA_FIELDS,
  );

  const createdDoc = await areaRef.get();
  ensureAreaExists(createdDoc);

  return toClientArea(createdDoc);
}

async function updateFloodAreaForAdmin(
  actorId,
  areaId,
  body,
) {
  const normalizedActorId = normalizeDocumentId(actorId);
  const normalizedAreaId = normalizeDocumentId(areaId);

  ensureAllowedBody(body);

  const actorRef = db
    .collection("users")
    .doc(normalizedActorId);

  const areaRef = db
    .collection(FLOOD_AREAS_COLLECTION)
    .doc(normalizedAreaId);

  const changedFields = await db.runTransaction(
    async (transaction) => {
      const actorDoc = await transaction.get(actorRef);
      ensureActiveAdmin(actorDoc);

      const areaDoc = await transaction.get(areaRef);
      ensureAreaExists(areaDoc);

      const existing = areaDoc.data();

      // Validate the complete result of a partial update.
      const merged = {};

      for (const field of ALLOWED_AREA_FIELDS) {
        if (Object.hasOwn(body, field)) {
          merged[field] = body[field];
        } else if (Object.hasOwn(existing, field)) {
          merged[field] = existing[field];
        }
      }

      const normalized = normalizeAreaInput(merged);
      const changes = {};

      for (const field of Object.keys(body)) {
        if (
          !isDeepStrictEqual(
            existing[field],
            normalized[field],
          )
        ) {
          changes[field] = normalized[field];
        }
      }

      const fields = Object.keys(changes);

      if (fields.length === 0) {
        return [];
      }

      // Preserve createdAt and any unrelated stored fields.
      transaction.update(areaRef, {
        ...changes,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return fields;
    },
  );

  if (changedFields.length > 0) {
    await auditAreaChange(
      normalizedActorId,
      normalizedAreaId,
      "flood_area.update",
      changedFields,
    );
  }

  const updatedDoc = await areaRef.get();
  ensureAreaExists(updatedDoc);

  return toClientArea(updatedDoc);
}

async function deleteFloodAreaForAdmin(actorId, areaId) {
  const normalizedActorId = normalizeDocumentId(actorId);
  const normalizedAreaId = normalizeDocumentId(areaId);

  const actorRef = db
    .collection("users")
    .doc(normalizedActorId);

  const areaRef = db
    .collection(FLOOD_AREAS_COLLECTION)
    .doc(normalizedAreaId);

  const linkedAlertsQuery = db
    .collection("flood_alerts")
    .where("areaId", "==", normalizedAreaId)
    .limit(1);

  await db.runTransaction(async (transaction) => {
    const actorDoc = await transaction.get(actorRef);
    ensureActiveAdmin(actorDoc);

    const areaDoc = await transaction.get(areaRef);
    ensureAreaExists(areaDoc);

    const linkedAlerts =
      await transaction.get(linkedAlertsQuery);

    if (!linkedAlerts.empty) {
      throw areaError(
        "ADMIN_AREA_HAS_ALERTS",
        "Flood area is referenced by flood alerts; set status to inactive instead",
        409,
      );
    }

    transaction.delete(areaRef);
  });

  await auditAreaChange(
    normalizedActorId,
    normalizedAreaId,
    "flood_area.delete",
    [],
  );

  return {
    id: normalizedAreaId,
  };
}

module.exports = {
  listFloodAreasForAdmin,
  getFloodAreaDetailForAdmin,
  createFloodAreaForAdmin,
  updateFloodAreaForAdmin,
  deleteFloodAreaForAdmin,
};