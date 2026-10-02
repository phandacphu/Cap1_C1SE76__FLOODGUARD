const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const SAFE_LOCATIONS_COLLECTION = "safe_locations";
const SAFE_LOCATION_SERVICES_COLLECTION =
  "safe_location_services";

const ALLOWED_TYPES = [
  "shelter",
  "school",
  "hospital",
  "community_center",
  "other",
];

const ALLOWED_STATUSES = ["active", "inactive"];

function normalizeOptionalString(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null`);
  }

  return value.trim() || null;
}

function normalizeLocation(location) {
  if (
    !location ||
    typeof location.latitude !== "number" ||
    typeof location.longitude !== "number"
  ) {
    throw new Error(
      "Safe location must contain numeric latitude and longitude",
    );
  }

  if (location.latitude < -90 || location.latitude > 90) {
    throw new Error(
      "Safe location latitude must be between -90 and 90",
    );
  }

  if (
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    throw new Error(
      "Safe location longitude must be between -180 and 180",
    );
  }

  return {
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function normalizeSafeLocationData(locationData) {
  if (
    !locationData ||
    typeof locationData.name !== "string" ||
    !locationData.name.trim()
  ) {
    throw new Error("Safe location name is required");
  }

  if (
    typeof locationData.address !== "string" ||
    !locationData.address.trim()
  ) {
    throw new Error("Safe location address is required");
  }

  if (!ALLOWED_TYPES.includes(locationData.type)) {
    throw new Error("Invalid safe location type");
  }

  if (
    !Number.isInteger(locationData.capacity) ||
    locationData.capacity < 0
  ) {
    throw new Error(
      "Safe location capacity must be a non-negative integer",
    );
  }

  if (!ALLOWED_STATUSES.includes(locationData.status)) {
    throw new Error("Invalid safe location status");
  }

  return {
    name: locationData.name.trim(),
    address: locationData.address.trim(),
    location: normalizeLocation(locationData.location),
    type: locationData.type,
    capacity: locationData.capacity,
    capacityNote: normalizeOptionalString(
      locationData.capacityNote,
      "capacityNote",
    ),
    description: normalizeOptionalString(
      locationData.description,
      "description",
    ),
    contactPhone: normalizeOptionalString(
      locationData.contactPhone,
      "contactPhone",
    ),
    status: locationData.status,
  };
}

async function getSafeLocationById(safeLocationId) {
  const locationDoc = await db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc(safeLocationId)
    .get();

  if (!locationDoc.exists) {
    return null;
  }

  return {
    id: locationDoc.id,
    ...locationDoc.data(),
  };
}

async function createSafeLocation(locationData) {
  const normalizedData =
    normalizeSafeLocationData(locationData);

  const locationRef = db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc();

  await locationRef.set({
    ...normalizedData,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return getSafeLocationById(locationRef.id);
}

async function setSafeLocationById(
  safeLocationId,
  locationData,
) {
  if (
    typeof safeLocationId !== "string" ||
    !safeLocationId.trim()
  ) {
    throw new Error("Safe location ID is required");
  }

  const normalizedData =
    normalizeSafeLocationData(locationData);

  const locationRef = db
    .collection(SAFE_LOCATIONS_COLLECTION)
    .doc(safeLocationId.trim());

  const existingLocation = await locationRef.get();

  await locationRef.set(
    {
      ...normalizedData,
      createdAt: existingLocation.exists
        ? existingLocation.data().createdAt
        : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {
      merge: false,
    },
  );

  return getSafeLocationById(locationRef.id);
}

async function ensureSafeLocationExists(safeLocationId) {
  const safeLocation =
    await getSafeLocationById(safeLocationId);

  if (!safeLocation) {
    throw new Error(
      "Referenced safe location does not exist",
    );
  }
}

function normalizeSafeLocationServiceData(serviceData) {
  if (
    !serviceData ||
    typeof serviceData.safeLocationId !== "string" ||
    !serviceData.safeLocationId.trim()
  ) {
    throw new Error("Safe location service location ID is required");
  }

  if (
    typeof serviceData.name !== "string" ||
    !serviceData.name.trim()
  ) {
    throw new Error("Safe location service name is required");
  }

  if (typeof serviceData.isAvailable !== "boolean") {
    throw new Error(
      "Safe location service availability must be boolean",
    );
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

async function setSafeLocationServiceById(
  serviceId,
  serviceData,
) {
  if (
    typeof serviceId !== "string" ||
    !serviceId.trim()
  ) {
    throw new Error("Safe location service ID is required");
  }

  const normalizedData =
    normalizeSafeLocationServiceData(serviceData);

  await ensureSafeLocationExists(
    normalizedData.safeLocationId,
  );

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
  setSafeLocationServiceById,
  getSafeLocationServiceById,
  normalizeSafeLocationData,
  normalizeSafeLocationServiceData,
};