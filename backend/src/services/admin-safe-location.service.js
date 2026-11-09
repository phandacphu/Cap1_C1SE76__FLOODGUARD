const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const { isDeepStrictEqual } = require("node:util");
const { logAuditEvent } = require("./audit-logging.service");
const {
  SAFE_LOCATION_FIELDS,
  normalizeSafeLocationData,
  normalizeSafeLocationId,
  safeLocationError,
  ensureFields,
  isSoftDeleted,
  isVisibleSafeLocation,
  isoTimestamp,
} = require("./safe-location-contract");
const { SAFE_LOCATIONS_COLLECTION } = require("./safe-location.service");

function actorRef(actorId) {
  try {
    normalizeSafeLocationId(actorId);
  } catch {
    throw safeLocationError(
      "ADMIN_SAFE_AUTH_REQUIRED",
      "Authentication is required",
      401,
    );
  }
  return db.collection("users").doc(actorId.trim());
}

function ensureActiveAdmin(doc) {
  if (!doc.exists)
    throw safeLocationError(
      "ADMIN_SAFE_USER_NOT_FOUND",
      "Authenticated user no longer exists",
      401,
    );
  const user = doc.data();
  if (user.isActive !== true)
    throw safeLocationError(
      "ADMIN_SAFE_ACCOUNT_INACTIVE",
      "Account is inactive",
      403,
    );
  if (user.role !== "admin")
    throw safeLocationError(
      "ADMIN_SAFE_ROLE_FORBIDDEN",
      "Only admins can manage safe locations",
      403,
    );
}

function ensureExists(doc) {
  if (!doc.exists || !isVisibleSafeLocation(doc.data())) {
    throw safeLocationError(
      "ADMIN_SAFE_LOCATION_NOT_FOUND",
      "Địa điểm không còn được cung cấp",
      404,
    );
  }
}

function toClient(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name ?? null,
    address: data.address ?? null,
    location: data.location ?? null,
    type: data.type ?? null,
    description: data.description ?? null,
    createdAt: isoTimestamp(data.createdAt),
    updatedAt: isoTimestamp(data.updatedAt),
  };
}

async function audit(actorId, locationId, action, changedFields) {
  // Existing audit wrapper is best effort. Never put old/new values in logs.
  await logAuditEvent({
    actor: { id: actorId.trim(), role: "admin" },
    action,
    target: { type: "safe_location", id: locationId },
    metadata: { source: "api", outcome: "success", changedFields },
  });
}

async function listSafeLocationsForAdmin(actorId) {
  ensureActiveAdmin(await actorRef(actorId).get());
  const snapshot = await db.collection(SAFE_LOCATIONS_COLLECTION).get();
  return snapshot.docs
    .filter((doc) => isVisibleSafeLocation(doc.data()))
    .map(toClient)
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function getSafeLocationDetailForAdmin(actorId, id) {
  ensureActiveAdmin(await actorRef(actorId).get());
  const doc = await db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc(normalizeSafeLocationId(id))
    .get();
  ensureExists(doc);
  return toClient(doc);
}

async function createSafeLocationForAdmin(actorId, body) {
  const userRef = actorRef(actorId);
  const data = normalizeSafeLocationData(body);
  const ref = db.collection(SAFE_LOCATIONS_COLLECTION).doc();
  await db.runTransaction(async (transaction) => {
    ensureActiveAdmin(await transaction.get(userRef));
    transaction.create(ref, {
      ...data,
      schemaVersion: 2,
      isDeleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await audit(actorId, ref.id, "safe_location.create", SAFE_LOCATION_FIELDS);
  const created = await ref.get();
  ensureExists(created);
  return toClient(created);
}

async function updateSafeLocationForAdmin(actorId, id, body) {
  const userRef = actorRef(actorId);
  const ref = db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc(normalizeSafeLocationId(id));
  ensureFields(body, SAFE_LOCATION_FIELDS, "INVALID_SAFE_LOCATION_DATA");
  const changedFields = await db.runTransaction(async (transaction) => {
    ensureActiveAdmin(await transaction.get(userRef));
    const doc = await transaction.get(ref);
    ensureExists(doc);
    const existing = doc.data();
    const merged = Object.fromEntries(
      SAFE_LOCATION_FIELDS.filter(
        (key) => Object.hasOwn(body, key) || Object.hasOwn(existing, key),
      ).map((key) => [
        key,
        Object.hasOwn(body, key) ? body[key] : existing[key],
      ]),
    );
    const normalized = normalizeSafeLocationData(merged);
    const changes = Object.fromEntries(
      Object.keys(body)
        .filter((key) => !isDeepStrictEqual(existing[key], normalized[key]))
        .map((key) => [key, normalized[key]]),
    );
    const fields = Object.keys(changes);
    if (fields.length)
      transaction.update(ref, {
        ...changes,
        updatedAt: FieldValue.serverTimestamp(),
      });
    return fields;
  });
  if (changedFields.length)
    await audit(actorId, ref.id, "safe_location.update", changedFields);
  const updated = await ref.get();
  ensureExists(updated);
  return toClient(updated);
}

async function deleteSafeLocationForAdmin(actorId, id) {
  const userRef = actorRef(actorId);
  const ref = db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc(normalizeSafeLocationId(id));
  const changed = await db.runTransaction(async (transaction) => {
    ensureActiveAdmin(await transaction.get(userRef));
    const doc = await transaction.get(ref);
    if (!doc.exists)
      throw safeLocationError(
        "ADMIN_SAFE_LOCATION_NOT_FOUND",
        "Địa điểm không còn được cung cấp",
        404,
      );
    if (isSoftDeleted(doc.data())) return false;
    transaction.update(ref, {
      isDeleted: true,
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: userRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (changed)
    await audit(actorId, ref.id, "safe_location.delete", ["isDeleted"]);
  const deleted = await ref.get();
  return {
    id: ref.id,
    deleted: true,
    deletedAt: isoTimestamp(deleted.data().deletedAt),
  };
}

module.exports = {
  listSafeLocationsForAdmin,
  getSafeLocationDetailForAdmin,
  createSafeLocationForAdmin,
  updateSafeLocationForAdmin,
  deleteSafeLocationForAdmin,
};
