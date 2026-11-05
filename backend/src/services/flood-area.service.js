const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const FLOOD_AREAS_COLLECTION = "flood_areas";
const ALLOWED_AREA_TYPES = Object.freeze(["flood", "low_lying"]);

// Missing/unknown legacy types stay unclassified until an Admin selects a type.
function readFloodAreaType(value) {
  return ALLOWED_AREA_TYPES.includes(value) ? value : null;
}

function validatePoint(point, index) {
  if (
    !point ||
    typeof point !== "object" ||
    Array.isArray(point) ||
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude)
  ) {
    throw new Error(
      `Geometry point ${index} must contain numeric latitude and longitude`,
    );
  }

  if (point.latitude < -90 || point.latitude > 90) {
    throw new Error(
      `Geometry point ${index} has an invalid latitude`,
    );
  }

  if (point.longitude < -180 || point.longitude > 180) {
    throw new Error(
      `Geometry point ${index} has an invalid longitude`,
    );
  }

  return {
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

function normalizeFloodAreaData(areaData) {
  if (
    !areaData ||
    typeof areaData !== "object" ||
    Array.isArray(areaData) ||
    typeof areaData.name !== "string" ||
    !areaData.name.trim()
  ) {
    throw new Error("Flood area name is required");
  }

  if (
    areaData.description !== undefined &&
    areaData.description !== null &&
    typeof areaData.description !== "string"
  ) {
    throw new Error(
      "Flood area description must be a string or null",
    );
  }

  if (
    !areaData.geometry ||
    areaData.geometry.type !== "polygon" ||
    !Array.isArray(areaData.geometry.points) ||
    areaData.geometry.points.length < 3
  ) {
    throw new Error(
      "Flood area geometry must be a polygon with at least three points",
    );
  }

  if (Object.hasOwn(areaData, "status") || Object.hasOwn(areaData, "severity")) {
    throw new Error("Flood area status and severity are no longer supported; use areaType");
  }

  if (!ALLOWED_AREA_TYPES.includes(areaData.areaType)) {
    throw new Error("Flood area areaType must be flood or low_lying");
  }

  if (
    typeof areaData.source !== "string" ||
    !areaData.source.trim()
  ) {
    throw new Error("Flood area source is required");
  }

  return {
    name: areaData.name.trim(),
    description:
      typeof areaData.description === "string"
        ? areaData.description.trim() || null
        : null,
    geometry: {
      type: "polygon",
      points: areaData.geometry.points.map(
        (point, index) => validatePoint(point, index),
      ),
    },
    areaType: areaData.areaType,
    source: areaData.source.trim(),
  };
}

async function createFloodArea(areaData) {
  const normalizedData = normalizeFloodAreaData(areaData);
  const areaRef = db.collection(FLOOD_AREAS_COLLECTION).doc();

  await areaRef.set({
    ...normalizedData,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return getFloodAreaById(areaRef.id);
}

async function setFloodAreaById(areaId, areaData) {
  if (
    typeof areaId !== "string" ||
    !areaId.trim()
  ) {
    throw new Error("Flood area ID is required");
  }

  const normalizedData = normalizeFloodAreaData(areaData);
  const areaRef = db
    .collection(FLOOD_AREAS_COLLECTION)
    .doc(areaId.trim());
  const existingArea = await areaRef.get();

  await areaRef.set(
    {
      ...normalizedData,
      createdAt: existingArea.exists
        ? existingArea.data().createdAt
        : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {
      merge: false,
    },
  );

  return getFloodAreaById(areaRef.id);
}

async function getFloodAreaById(areaId) {
  const areaDoc = await db
    .collection(FLOOD_AREAS_COLLECTION)
    .doc(areaId)
    .get();

  if (!areaDoc.exists) {
    return null;
  }

  return {
    id: areaDoc.id,
    ...areaDoc.data(),
  };
}

async function getFloodAreas() {
  const snapshot = await db
    .collection(FLOOD_AREAS_COLLECTION)
    .get();

  return snapshot.docs.map((areaDoc) => ({
    id: areaDoc.id,
    ...areaDoc.data(),
  }));
}

module.exports = {
  FLOOD_AREAS_COLLECTION,
  ALLOWED_AREA_TYPES,
  readFloodAreaType,
  createFloodArea,
  setFloodAreaById,
  getFloodAreaById,
  getFloodAreas,
  normalizeFloodAreaData,
};
