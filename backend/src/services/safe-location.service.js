const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const {
  normalizeSafeLocationData,
  normalizeSafeLocationId,
  normalizeSafeLocationQuery,
  isVisibleSafeLocation,
  isSoftDeleted,
  calculateDistanceKm,
  toClientSafeLocation,
  safeLocationError,
} = require("./safe-location-contract");

const SAFE_LOCATIONS_COLLECTION = "safe_locations";
const SAFE_LOCATION_SERVICES_COLLECTION = "safe_location_services";

async function getSafeLocationById(id) {
  const doc = await db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc(normalizeSafeLocationId(id))
    .get();
  if (!doc.exists || !isVisibleSafeLocation(doc.data())) return null;
  return { ...doc.data(), id: doc.id };
}

async function getSafeLocations(query = {}) {
  const origin = normalizeSafeLocationQuery(query);
  const snapshot = await db.collection(SAFE_LOCATIONS_COLLECTION).get();
  const locations = [];
  for (const doc of snapshot.docs) {
    if (!isVisibleSafeLocation(doc.data())) continue;
    try {
      locations.push(
        toClientSafeLocation({ ...doc.data(), id: doc.id }, origin),
      );
    } catch (error) {
      if (error.code !== "INVALID_SAFE_LOCATION_DATA") throw error;
      // Invalid legacy coordinates/records cannot become navigable public pins.
    }
  }
  return locations.sort(
    origin
      ? (a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id)
      : (a, b) =>
          a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id),
  );
}

async function getSafeLocationDetail(id, query = {}) {
  const origin = normalizeSafeLocationQuery(query);
  const record = await getSafeLocationById(id);
  if (record) {
    try {
      return toClientSafeLocation(record, origin);
    } catch (error) {
      if (error.code !== "INVALID_SAFE_LOCATION_DATA") throw error;
    }
  }
  throw safeLocationError(
    "SAFE_LOCATION_NOT_FOUND",
    "Địa điểm không còn được cung cấp",
    404,
  );
}

// Alias for existing callers; v2 never truncates by radius or type.
async function getNearbySafeLocations(query = {}) {
  normalizeSafeLocationQuery(query, true);
  return getSafeLocations(query);
}

// Trusted fixtures only. Live writes must use the Admin API.
async function createSafeLocation(input) {
  const data = normalizeSafeLocationData(input);
  const ref = db.collection(SAFE_LOCATIONS_COLLECTION).doc();
  await ref.create({
    ...data,
    schemaVersion: 2,
    isDeleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return getSafeLocationById(ref.id);
}

async function setSafeLocationById(id, input) {
  const data = normalizeSafeLocationData(input);
  const ref = db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc(normalizeSafeLocationId(id));
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (
      existing.exists &&
      (isSoftDeleted(existing.data()) ||
        !isVisibleSafeLocation(existing.data()))
    ) {
      throw safeLocationError(
        "SAFE_LOCATION_NOT_FOUND",
        "Archived safe location cannot be replaced",
        404,
      );
    }
    const saved = {
      ...data,
      schemaVersion: 2,
      isDeleted: false,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (existing.exists) transaction.update(ref, saved);
    else
      transaction.create(ref, {
        ...saved,
        createdAt: FieldValue.serverTimestamp(),
      });
  });
  return getSafeLocationById(ref.id);
}

async function ensureSafeLocationExists(id) {
  if (!(await getSafeLocationById(id)))
    throw new Error("Referenced safe location does not exist");
}

function normalizeOptionalString(value, fieldName) {
  if (value == null) return null;
  if (typeof value !== "string")
    throw new Error(`${fieldName} must be a string or null`);
  return value.trim() || null;
}

// Legacy service helpers remain storage-only. The v2 API never exposes services.
function normalizeSafeLocationServiceData(serviceData) {
  if (
    !serviceData ||
    typeof serviceData.safeLocationId !== "string" ||
    !serviceData.safeLocationId.trim()
  ) {
    throw new Error("Safe location service location ID is required");
  }

  if (typeof serviceData.name !== "string" || !serviceData.name.trim()) {
    throw new Error("Safe location service name is required");
  }

  if (typeof serviceData.isAvailable !== "boolean") {
    throw new Error("Safe location service availability must be boolean");
  }

  return {
    safeLocationId: serviceData.safeLocationId.trim(),
    name: serviceData.name.trim(),
    description: normalizeOptionalString(
      serviceData.description,
      "description",
    ),
    isAvailable: serviceData.isAvailable,
  };
}

async function getSafeLocationServiceById(serviceId) {
  const serviceDoc = await db
    .collection(SAFE_LOCATION_SERVICES_COLLECTION)
    .doc(serviceId)
    .get();

  if (!serviceDoc.exists) {
    return null;
  }

  return {
    id: serviceDoc.id,
    ...serviceDoc.data(),
  };
}

async function setSafeLocationServiceById(serviceId, serviceData) {
  if (typeof serviceId !== "string" || !serviceId.trim()) {
    throw new Error("Safe location service ID is required");
  }

  const normalizedData = normalizeSafeLocationServiceData(serviceData);

  await ensureSafeLocationExists(normalizedData.safeLocationId);

  const serviceRef = db
    .collection(SAFE_LOCATION_SERVICES_COLLECTION)
    .doc(serviceId.trim());

  const existingService = await serviceRef.get();

  await serviceRef.set(
    {
      ...normalizedData,
      createdAt: existingService.exists
        ? existingService.data().createdAt
        : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {
      merge: false,
    },
  );

  return getSafeLocationServiceById(serviceRef.id);
}

module.exports = {
  SAFE_LOCATIONS_COLLECTION,
  SAFE_LOCATION_SERVICES_COLLECTION,
  createSafeLocation,
  setSafeLocationById,
  getSafeLocationById,
  getSafeLocations,
  getSafeLocationDetail,
  getNearbySafeLocations,
  normalizeSafeLocationData,
  normalizeNearbySafeLocationFilters: (query) =>
    normalizeSafeLocationQuery(query, true),
  calculateDistanceKm,
  setSafeLocationServiceById,
  getSafeLocationServiceById,
  normalizeSafeLocationServiceData,
};
