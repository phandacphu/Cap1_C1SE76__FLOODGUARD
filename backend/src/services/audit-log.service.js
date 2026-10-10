const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const AUDIT_LOGS_COLLECTION = "audit_logs";

const ALLOWED_ACTOR_ROLES = [
  "resident",
  "rescue",
  "admin",
];

const ALLOWED_CHANGED_FIELDS = [
  "fullName",
  "role",
  "isActive",
  "name",
  "description",
  "location",
  "severity",
  "urgency",
  "status",
  "capacity",
];

function invalidAuditData(message) {
  const error = new Error(message);
  error.code = "INVALID_AUDIT_LOG_DATA";
  return error;
}

function ensurePlainObject(value, fieldName) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw invalidAuditData(
      `${fieldName} must be a plain object`,
    );
  }
}

function ensureAllowedKeys(value, allowedKeys, fieldName) {
  if (
    Object.keys(value).some(
      (key) => !allowedKeys.includes(key),
    )
  ) {
    throw invalidAuditData(
      `${fieldName} contains unsupported fields`,
    );
  }
}

function normalizeDocumentId(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw invalidAuditData(`${fieldName} is required`);
  }

  const normalized = value.trim();

  if (
    normalized.includes("/") ||
    normalized === "." ||
    normalized === ".." ||
    Buffer.byteLength(normalized, "utf8") > 1500
  ) {
    throw invalidAuditData(`${fieldName} is invalid`);
  }

  return normalized;
}

function normalizeLabel(value, fieldName) {
  if (
    typeof value !== "string" ||
    !/^[a-z][a-z0-9_.-]{0,79}$/.test(value.trim())
  ) {
    throw invalidAuditData(`${fieldName} is invalid`);
  }

  return value.trim();
}

function normalizeAuditMetadata(value) {
  if (value === undefined || value === null) {
    return {};
  }

  ensurePlainObject(value, "Audit metadata");

  ensureAllowedKeys(
    value,
    ["source", "outcome", "changedFields"],
    "Audit metadata",
  );

  const metadata = {};

  if (value.source !== undefined) {
    if (!["api", "system", "test"].includes(value.source)) {
      throw invalidAuditData("Invalid audit source");
    }

    metadata.source = value.source;
  }

  if (value.outcome !== undefined) {
    if (!["success", "failure"].includes(value.outcome)) {
      throw invalidAuditData("Invalid audit outcome");
    }

    metadata.outcome = value.outcome;
  }

  if (value.changedFields !== undefined) {
    if (
      !Array.isArray(value.changedFields) ||
      value.changedFields.length > ALLOWED_CHANGED_FIELDS.length ||
      value.changedFields.some(
        (field) => !ALLOWED_CHANGED_FIELDS.includes(field),
      )
    ) {
      throw invalidAuditData(
        "Invalid audit changedFields",
      );
    }

    // Store field names only, never their old/new values.
    metadata.changedFields = [
      ...new Set(value.changedFields),
    ];
  }

  return metadata;
}

function normalizeAuditLogData(logData) {
  ensurePlainObject(logData, "Audit log data");

  ensureAllowedKeys(
    logData,
    ["actor", "action", "target", "metadata"],
    "Audit log data",
  );

  ensurePlainObject(logData.actor, "Audit actor");
  ensureAllowedKeys(
    logData.actor,
    ["id", "role"],
    "Audit actor",
  );

  if (!ALLOWED_ACTOR_ROLES.includes(logData.actor.role)) {
    throw invalidAuditData("Invalid audit actor role");
  }

  ensurePlainObject(logData.target, "Audit target");
  ensureAllowedKeys(
    logData.target,
    ["type", "id"],
    "Audit target",
  );

  return {
    actor: {
      id: normalizeDocumentId(
        logData.actor.id,
        "Audit actor ID",
      ),
      role: logData.actor.role,
    },
    action: normalizeLabel(
      logData.action,
      "Audit action",
    ),
    target: {
      type: normalizeLabel(
        logData.target.type,
        "Audit target type",
      ),
      id: normalizeDocumentId(
        logData.target.id,
        "Audit target ID",
      ),
    },
    metadata: normalizeAuditMetadata(logData.metadata),
  };
}

// Internal helper. Callers supply trusted actor/action/target;
// these values must not come directly from client input.
// Write failures propagate here. CCF-168 adds the shared
// wrapper that handles logging failures for business APIs.
async function createAuditLog(logData) {
  const data = normalizeAuditLogData(logData);

  const logRef = db
    .collection(AUDIT_LOGS_COLLECTION)
    .doc();

  await logRef.create({
    ...data,
    timestamp: FieldValue.serverTimestamp(),
  });

  return {
    id: logRef.id,
  };
}

module.exports = {
  AUDIT_LOGS_COLLECTION,
  ALLOWED_ACTOR_ROLES,
  ALLOWED_CHANGED_FIELDS,
  normalizeAuditLogData,
  createAuditLog,
};