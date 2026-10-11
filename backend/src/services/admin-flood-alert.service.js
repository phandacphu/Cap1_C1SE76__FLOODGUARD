const { db } = require("../config/firebase");
const {
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");
const { isDeepStrictEqual } = require("node:util");

const {
  FLOOD_ALERTS_COLLECTION,
  normalizeFloodAlertData,
} = require("./flood-alert.service");

const {
  FLOOD_AREAS_COLLECTION,
} = require("./flood-area.service");

const {
  logAuditEvent,
} = require("./audit-logging.service");

const ALLOWED_ALERT_FIELDS = [
  "title",
  "content",
  "severity",
  "status",
  "areaId",
  "startAt",
  "endAt",
];

function alertError(code, message, statusCode) {
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
    throw alertError(
      "INVALID_ADMIN_ALERT_ID",
      "Invalid document ID",
      400,
    );
  }

  return value.trim();
}

function ensureActiveAdmin(userDoc) {
  if (!userDoc.exists) {
    throw alertError(
      "ADMIN_ALERT_AUTH_REQUIRED",
      "Authenticated user no longer exists",
      401,
    );
  }

  const user = userDoc.data();

  if (user.isActive !== true) {
    throw alertError(
      "ADMIN_ALERT_ACCOUNT_INACTIVE",
      "Account is inactive",
      403,
    );
  }

  if (user.role !== "admin") {
    throw alertError(
      "ADMIN_ALERT_ROLE_FORBIDDEN",
      "Only admins can manage flood warnings",
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

function normalizeClientTimestamp(value, fieldName) {
  // Require an explicit UTC timestamp from the client.
  const match = typeof value === "string"
    ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
    : null;

  if (!match) {
    throw alertError(
      "INVALID_ADMIN_ALERT_DATA",
      `${fieldName} must be an ISO 8601 UTC string ending in Z`,
      400,
    );
  }

  const canonical =
    `${match[1]}.${(match[2] || "").padEnd(3, "0")}Z`;

  const date = new Date(canonical);

  // Reject dates that JavaScript would normalize,
  // such as February 30 or hour 24.
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString() !== canonical
  ) {
    throw alertError(
      "INVALID_ADMIN_ALERT_DATA",
      `${fieldName} must contain a valid date and time`,
      400,
    );
  }

  return Timestamp.fromDate(date);
}

function normalizeBody(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) !== Object.prototype
  ) {
    throw alertError(
      "INVALID_ADMIN_ALERT_DATA",
      "Flood warning body must be an object",
      400,
    );
  }

  const fields = Object.keys(body);

  if (
    fields.length === 0 ||
    fields.some(
      (field) => !ALLOWED_ALERT_FIELDS.includes(field),
    )
  ) {
    throw alertError(
      "INVALID_ADMIN_ALERT_DATA",
      "Provide only title, content, severity, status, areaId, startAt or endAt",
      400,
    );
  }

  const data = { ...body };

  for (const field of ["startAt", "endAt"]) {
    if (Object.hasOwn(data, field)) {
      data[field] = normalizeClientTimestamp(
        data[field],
        field,
      );
    }
  }

  if (Object.hasOwn(data, "areaId")) {
    data.areaId = normalizeDocumentId(data.areaId);
  }

  return data;
}

function normalizeAlertInput(data) {
  try {
    const normalized = normalizeFloodAlertData(data);

    // Validate IDs even when they came from stored data
    // while constructing a partial update.
    normalized.areaId = normalizeDocumentId(
      normalized.areaId,
    );

    return normalized;
  } catch (error) {
    throw alertError(
      "INVALID_ADMIN_ALERT_DATA",
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

function toClientAlert(alertDoc) {
  const alert = alertDoc.data();

  return {
    id: alertDoc.id,
    title: alert.title ?? null,
    content: alert.content ?? null,
    severity: alert.severity ?? null,
    status: alert.status ?? null,
    areaId: alert.areaId ?? null,
    startAt: toIsoString(alert.startAt),
    endAt: toIsoString(alert.endAt),
    createdAt: toIsoString(alert.createdAt),
    updatedAt: toIsoString(alert.updatedAt),
  };
}

function ensureAlertExists(alertDoc) {
  if (!alertDoc.exists) {
    throw alertError(
      "ADMIN_ALERT_NOT_FOUND",
      "Flood warning not found",
      404,
    );
  }
}

function ensureAreaExists(areaDoc) {
  if (!areaDoc.exists) {
    throw alertError(
      "ADMIN_ALERT_AREA_NOT_FOUND",
      "Referenced flood area does not exist",
      404,
    );
  }
}

async function auditAlertChange(
  actorId,
  alertId,
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
      type: "flood_alert",
      id: alertId,
    },
    metadata: {
      source: "api",
      outcome: "success",
      changedFields,
    },
  });
}

async function listFloodAlertsForAdmin(actorId) {
  await authorizeAdmin(actorId);

  const snapshot = await db
    .collection(FLOOD_ALERTS_COLLECTION)
    .get();

  return snapshot.docs
    .map(toClientAlert)
    .sort((first, second) => {
      const firstTime = first.startAt
        ? Date.parse(first.startAt)
        : 0;

      const secondTime = second.startAt
        ? Date.parse(second.startAt)
        : 0;

      return (
        secondTime - firstTime ||
        first.id.localeCompare(second.id)
      );
    });
}

async function getFloodAlertDetailForAdmin(
  actorId,
  alertId,
) {
  await authorizeAdmin(actorId);

  const normalizedAlertId = normalizeDocumentId(
    alertId,
  );

  const alertDoc = await db
    .collection(FLOOD_ALERTS_COLLECTION)
    .doc(normalizedAlertId)
    .get();

  ensureAlertExists(alertDoc);

  return toClientAlert(alertDoc);
}

async function createFloodAlertForAdmin(actorId, body) {
  const normalizedActorId = normalizeDocumentId(
    actorId,
  );

  const data = normalizeAlertInput(
    normalizeBody(body),
  );

  const actorRef = db
    .collection("users")
    .doc(normalizedActorId);

  const areaRef = db
    .collection(FLOOD_AREAS_COLLECTION)
    .doc(data.areaId);

  // Allocate once, outside the retryable callback.
  const alertRef = db
    .collection(FLOOD_ALERTS_COLLECTION)
    .doc();

  await db.runTransaction(async (transaction) => {
    const actorDoc = await transaction.get(actorRef);
    ensureActiveAdmin(actorDoc);

    const areaDoc = await transaction.get(areaRef);
    ensureAreaExists(areaDoc);

    // All reads are completed before writing.
    transaction.create(alertRef, {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await auditAlertChange(
    normalizedActorId,
    alertRef.id,
    "flood_alert.create",
    ALLOWED_ALERT_FIELDS,
  );

  const createdDoc = await alertRef.get();
  ensureAlertExists(createdDoc);

  return toClientAlert(createdDoc);
}

async function updateFloodAlertForAdmin(
  actorId,
  alertId,
  body,
) {
  const normalizedActorId = normalizeDocumentId(
    actorId,
  );

  const normalizedAlertId = normalizeDocumentId(
    alertId,
  );

  const input = normalizeBody(body);

  const actorRef = db
    .collection("users")
    .doc(normalizedActorId);

  const alertRef = db
    .collection(FLOOD_ALERTS_COLLECTION)
    .doc(normalizedAlertId);

  const changedFields = await db.runTransaction(
    async (transaction) => {
      const actorDoc = await transaction.get(actorRef);
      ensureActiveAdmin(actorDoc);

      const alertDoc = await transaction.get(alertRef);
      ensureAlertExists(alertDoc);

      const existing = alertDoc.data();
      const merged = {};

      for (const field of ALLOWED_ALERT_FIELDS) {
        if (Object.hasOwn(input, field)) {
          merged[field] = input[field];
        } else if (Object.hasOwn(existing, field)) {
          merged[field] = existing[field];
        }
      }

      // Validate the entire result, including the
      // relationship between startAt and endAt.
      const normalized = normalizeAlertInput(merged);

      const areaRef = db
        .collection(FLOOD_AREAS_COLLECTION)
        .doc(normalized.areaId);

      const areaDoc = await transaction.get(areaRef);
      ensureAreaExists(areaDoc);

      const changes = {};

      for (const field of Object.keys(input)) {
        const oldValue = existing[field];
        const newValue = normalized[field];

        const equal =
          oldValue instanceof Timestamp &&
          newValue instanceof Timestamp
            ? oldValue.isEqual(newValue)
            : isDeepStrictEqual(oldValue, newValue);

        if (!equal) {
          changes[field] = newValue;
        }
      }

      const fields = Object.keys(changes);

      if (fields.length === 0) {
        return [];
      }

      // Preserve createdAt and unrelated stored fields.
      transaction.update(alertRef, {
        ...changes,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return fields;
    },
  );

  if (changedFields.length > 0) {
    await auditAlertChange(
      normalizedActorId,
      normalizedAlertId,
      "flood_alert.update",
      changedFields,
    );
  }

  const updatedDoc = await alertRef.get();
  ensureAlertExists(updatedDoc);

  return toClientAlert(updatedDoc);
}

module.exports = {
  listFloodAlertsForAdmin,
  getFloodAlertDetailForAdmin,
  createFloodAlertForAdmin,
  updateFloodAlertForAdmin,
};