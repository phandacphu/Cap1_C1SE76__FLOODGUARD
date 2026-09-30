const { db } = require("../config/firebase");
const {
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");
const {
  FLOOD_AREAS_COLLECTION,
} = require("./flood-area.service");

const FLOOD_ALERTS_COLLECTION = "flood_alerts";
const ALLOWED_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
];
const ALLOWED_STATUSES = ["active", "inactive"];
const SEVERITY_PRIORITY = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function normalizeTimestamp(value, fieldName) {
  if (value instanceof Timestamp) {
    return value;
  }

  if (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    return Timestamp.fromDate(value);
  }

  if (typeof value === "string") {
    const parsedDate = new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return Timestamp.fromDate(parsedDate);
    }
  }

  throw new Error(
    `${fieldName} must be a valid date or Firestore Timestamp`,
  );
}

function normalizeFloodAlertData(alertData) {
  if (
    !alertData ||
    typeof alertData.title !== "string" ||
    !alertData.title.trim()
  ) {
    throw new Error("Flood alert title is required");
  }

  if (
    typeof alertData.content !== "string" ||
    !alertData.content.trim()
  ) {
    throw new Error("Flood alert content is required");
  }

  if (!ALLOWED_SEVERITIES.includes(alertData.severity)) {
    throw new Error("Invalid flood alert severity");
  }

  if (!ALLOWED_STATUSES.includes(alertData.status)) {
    throw new Error("Invalid flood alert status");
  }

  if (
    typeof alertData.areaId !== "string" ||
    !alertData.areaId.trim()
  ) {
    throw new Error("Flood alert area ID is required");
  }

  const startAt = normalizeTimestamp(
    alertData.startAt,
    "startAt",
  );
  const endAt = normalizeTimestamp(
    alertData.endAt,
    "endAt",
  );

  if (startAt.toMillis() >= endAt.toMillis()) {
    throw new Error(
      "Flood alert startAt must be earlier than endAt",
    );
  }

  return {
    title: alertData.title.trim(),
    content: alertData.content.trim(),
    severity: alertData.severity,
    status: alertData.status,
    areaId: alertData.areaId.trim(),
    startAt,
    endAt,
  };
}

async function ensureFloodAreaExists(areaId) {
  const areaDoc = await db
    .collection(FLOOD_AREAS_COLLECTION)
    .doc(areaId)
    .get();

  if (!areaDoc.exists) {
    throw new Error("Referenced flood area does not exist");
  }
}

async function createFloodAlert(alertData) {
  const normalizedData =
    normalizeFloodAlertData(alertData);

  await ensureFloodAreaExists(normalizedData.areaId);

  const alertRef = db
    .collection(FLOOD_ALERTS_COLLECTION)
    .doc();

  await alertRef.set({
    ...normalizedData,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return getFloodAlertById(alertRef.id);
}

async function setFloodAlertById(alertId, alertData) {
  if (
    typeof alertId !== "string" ||
    !alertId.trim()
  ) {
    throw new Error("Flood alert ID is required");
  }

  const normalizedData =
    normalizeFloodAlertData(alertData);

  await ensureFloodAreaExists(normalizedData.areaId);

  const alertRef = db
    .collection(FLOOD_ALERTS_COLLECTION)
    .doc(alertId.trim());
  const existingAlert = await alertRef.get();

  await alertRef.set(
    {
      ...normalizedData,
      createdAt: existingAlert.exists
        ? existingAlert.data().createdAt
        : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {
      merge: false,
    },
  );

  return getFloodAlertById(alertRef.id);
}

async function getFloodAlertById(alertId) {
  const alertDoc = await db
    .collection(FLOOD_ALERTS_COLLECTION)
    .doc(alertId)
    .get();

  if (!alertDoc.exists) {
    return null;
  }

  return {
    id: alertDoc.id,
    ...alertDoc.data(),
  };
}

async function getActiveFloodAlerts(
  currentTime = Timestamp.now(),
) {
  const normalizedCurrentTime = normalizeTimestamp(
    currentTime,
    "currentTime",
  );
  const currentTimeMillis =
    normalizedCurrentTime.toMillis();

  const snapshot = await db
    .collection(FLOOD_ALERTS_COLLECTION)
    .where("status", "==", "active")
    .get();

  return snapshot.docs
    .map((alertDoc) => ({
      id: alertDoc.id,
      ...alertDoc.data(),
    }))
    .filter((alert) => {
      if (
        !(alert.startAt instanceof Timestamp) ||
        !(alert.endAt instanceof Timestamp)
      ) {
        return false;
      }

      return (
        alert.startAt.toMillis() <= currentTimeMillis &&
        alert.endAt.toMillis() >= currentTimeMillis
      );
    })
    .sort((firstAlert, secondAlert) => {
      const severityDifference =
        SEVERITY_PRIORITY[secondAlert.severity] -
        SEVERITY_PRIORITY[firstAlert.severity];

      if (severityDifference !== 0) {
        return severityDifference;
      }

      return (
        secondAlert.startAt.toMillis() -
        firstAlert.startAt.toMillis()
      );
    });
}

function normalizeFloodAlertFilters(filters = {}) {
  const normalizedFilters = {};

  if (filters.areaId !== undefined) {
    if (
      typeof filters.areaId !== "string" ||
      !filters.areaId.trim()
    ) {
      throw new Error("Invalid areaId filter");
    }

    normalizedFilters.areaId = filters.areaId.trim();
  }

  if (filters.severity !== undefined) {
    if (
      typeof filters.severity !== "string" ||
      !ALLOWED_SEVERITIES.includes(filters.severity)
    ) {
      throw new Error("Invalid severity filter");
    }

    normalizedFilters.severity = filters.severity;
  }

  if (filters.status !== undefined) {
    if (
      typeof filters.status !== "string" ||
      !ALLOWED_STATUSES.includes(filters.status)
    ) {
      throw new Error("Invalid status filter");
    }

    normalizedFilters.status = filters.status;
  }

  return normalizedFilters;
}

async function getFloodAlerts(filters = {}) {
  const normalizedFilters =
    normalizeFloodAlertFilters(filters);

  const snapshot = await db
    .collection(FLOOD_ALERTS_COLLECTION)
    .get();

  return snapshot.docs
    .map((alertDoc) => ({
      id: alertDoc.id,
      ...alertDoc.data(),
    }))
    .filter((alert) =>
      Object.entries(normalizedFilters).every(
        ([field, value]) => alert[field] === value,
      ),
    )
    .sort((firstAlert, secondAlert) => {
      const firstStartAt =
        firstAlert.startAt instanceof Timestamp
          ? firstAlert.startAt.toMillis()
          : 0;
      const secondStartAt =
        secondAlert.startAt instanceof Timestamp
          ? secondAlert.startAt.toMillis()
          : 0;

      return secondStartAt - firstStartAt;
    });
}

module.exports = {
  FLOOD_ALERTS_COLLECTION,
  createFloodAlert,
  setFloodAlertById,
  getFloodAlertById,
  getActiveFloodAlerts,
  getFloodAlerts,
  normalizeFloodAlertData,
  normalizeFloodAlertFilters,
};