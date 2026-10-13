const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const { isDeepStrictEqual } = require("node:util");

const {
  SAFE_LOCATIONS_COLLECTION,
  normalizeSafeLocationData,
} = require("./safe-location.service");

const {
  logAuditEvent,
} = require("./audit-logging.service");

const ALLOWED_SAFE_LOCATION_FIELDS = [
  "name",
  "address",
  "location",
  "type",
  "capacity",
  "capacityNote",
  "description",
  "contactPhone",
  "status",
];

function safeLocationError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function isValidDocumentId(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.trim().includes("/") &&
    value.trim() !== "." &&
    value.trim() !== ".." &&
    Buffer.byteLength(value.trim(), "utf8") <= 1500
  );
}

function normalizeActorId(actorId) {
  if (!isValidDocumentId(actorId)) {
    throw safeLocationError(
      "ADMIN_SAFE_AUTH_REQUIRED",
      "Authentication is required",
      401,
    );
  }

  return actorId.trim();
}

function normalizeSafeLocationId(locationId) {
  if (!isValidDocumentId(locationId)) {
    throw safeLocationError(
      "INVALID_ADMIN_SAFE_LOCATION_ID",
      "Invalid safe location ID",
      400,
    );
  }

  return locationId.trim();
}

function ensureActiveAdmin(userDoc) {
  if (!userDoc.exists) {
    throw safeLocationError(
      "ADMIN_SAFE_USER_NOT_FOUND",
      "Authenticated user no longer exists",
      401,
    );
  }

  const user = userDoc.data();

  if (user.isActive !== true) {
    throw safeLocationError(
      "ADMIN_SAFE_ACCOUNT_INACTIVE",
      "Account is inactive",
      403,
    );
  }

  if (user.role !== "admin") {
    throw safeLocationError(
      "ADMIN_SAFE_ROLE_FORBIDDEN",
      "Only admins can manage safe locations",
      403,
    );
  }
}

async function authorizeAdmin(actorId) {
  const normalizedActorId = normalizeActorId(actorId);

  const actorDoc = await db
    .collection("users")
    .doc(normalizedActorId)
    .get();

  ensureActiveAdmin(actorDoc);

  return normalizedActorId;
}

function ensurePlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function ensureAllowedBody(body) {
  if (!ensurePlainObject(body)) {
    throw safeLocationError(
      "INVALID_ADMIN_SAFE_LOCATION_DATA",
      "Safe location body must be an object",
      400,
    );
  }

  const fields = Object.keys(body);

  if (
    fields.length === 0 ||
    fields.some(
      (field) =>
        !ALLOWED_SAFE_LOCATION_FIELDS.includes(field),
    )
  ) {
    throw safeLocationError(
      "INVALID_ADMIN_SAFE_LOCATION_DATA",
      "Provide only name, address, location, type, capacity, capacityNote, description, contactPhone or status",
      400,
    );
  }

  if (Object.hasOwn(body, "location")) {
    if (
      !ensurePlainObject(body.location) ||
      Object.keys(body.location).some(
        (field) =>
          !["latitude", "longitude"].includes(field),
      )
    ) {
      throw safeLocationError(
        "INVALID_ADMIN_SAFE_LOCATION_DATA",
        "Location must contain only latitude and longitude",
        400,
      );
    }
  }
}

function normalizeInput(data) {
  try {
    return normalizeSafeLocationData(data);
  } catch (error) {
    throw safeLocationError(
      "INVALID_ADMIN_SAFE_LOCATION_DATA",
      error.message,
      400,
    );
  }
}

function ensureLocationExists(locationDoc) {
  if (!locationDoc.exists) {
    throw safeLocationError(
      "ADMIN_SAFE_LOCATION_NOT_FOUND",
      "Safe location not found",
      404,
    );
  }
}

function toIsoString(value) {
  return value && typeof value.toDate === "function"
    ? value.toDate().toISOString()
    : null;
}

function toClientSafeLocation(locationDoc) {
  const data = locationDoc.data();

  return {
    id: locationDoc.id,
    name: data.name ?? null,
    address: data.address ?? null,
    location: data.location ?? null,
    type: data.type ?? null,
    capacity: data.capacity ?? null,
    capacityNote: data.capacityNote ?? null,
    description: data.description ?? null,
    contactPhone: data.contactPhone ?? null,
    status: data.status ?? null,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

async function auditSafeLocationChange(
  actorId,
  locationId,
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
      type: "safe_location",
      id: locationId,
    },
    metadata: {
      source: "api",
      outcome: "success",
      changedFields,
    },
  });
}

async function listSafeLocationsForAdmin(actorId) {
  await authorizeAdmin(actorId);

  const snapshot = await db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .get();

  return snapshot.docs
    .map(toClientSafeLocation)
    .sort((first, second) =>
      first.id.localeCompare(second.id),
    );
}

async function getSafeLocationDetailForAdmin(
  actorId,
  locationId,
) {
  await authorizeAdmin(actorId);

  const normalizedLocationId =
    normalizeSafeLocationId(locationId);

  const locationDoc = await db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc(normalizedLocationId)
    .get();

  ensureLocationExists(locationDoc);

  return toClientSafeLocation(locationDoc);
}

async function createSafeLocationForAdmin(
  actorId,
  body,
) {
  const normalizedActorId = normalizeActorId(actorId);

  ensureAllowedBody(body);
  const data = normalizeInput(body);

  const actorRef = db
    .collection("users")
    .doc(normalizedActorId);

  // Allocate once, outside the retryable callback.
  const locationRef = db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc();

  await db.runTransaction(async (transaction) => {
    const actorDoc = await transaction.get(actorRef);
    ensureActiveAdmin(actorDoc);

    transaction.create(locationRef, {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  // Log only after the business transaction commits.
  await auditSafeLocationChange(
    normalizedActorId,
    locationRef.id,
    "safe_location.create",
    ALLOWED_SAFE_LOCATION_FIELDS,
  );

  const createdDoc = await locationRef.get();
  ensureLocationExists(createdDoc);

  return toClientSafeLocation(createdDoc);
}

async function updateSafeLocationForAdmin(
  actorId,
  locationId,
  body,
) {
  const normalizedActorId = normalizeActorId(actorId);
  const normalizedLocationId =
    normalizeSafeLocationId(locationId);

  ensureAllowedBody(body);

  const actorRef = db
    .collection("users")
    .doc(normalizedActorId);

  const locationRef = db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc(normalizedLocationId);

  const changedFields = await db.runTransaction(
    async (transaction) => {
      const actorDoc = await transaction.get(actorRef);
      ensureActiveAdmin(actorDoc);

      const locationDoc =
        await transaction.get(locationRef);

      ensureLocationExists(locationDoc);

      const existing = locationDoc.data();
      const merged = {};

      // Validate the complete result of the partial update.
      for (const field of ALLOWED_SAFE_LOCATION_FIELDS) {
        if (Object.hasOwn(body, field)) {
          merged[field] = body[field];
        } else if (Object.hasOwn(existing, field)) {
          merged[field] = existing[field];
        }
      }

      const normalized = normalizeInput(merged);
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

      // Preserve createdAt and unrelated stored fields.
      transaction.update(locationRef, {
        ...changes,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return fields;
    },
  );

  if (changedFields.length > 0) {
    await auditSafeLocationChange(
      normalizedActorId,
      normalizedLocationId,
      "safe_location.update",
      changedFields,
    );
  }

  const updatedDoc = await locationRef.get();
  ensureLocationExists(updatedDoc);

  return toClientSafeLocation(updatedDoc);
}

module.exports = {
  listSafeLocationsForAdmin,
  getSafeLocationDetailForAdmin,
  createSafeLocationForAdmin,
  updateSafeLocationForAdmin,
};