const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const { logAuditEvent } = require("./audit-logging.service");

const USERS_COLLECTION = "users";
const ALLOWED_USER_ROLES = ["resident", "rescue", "admin"];

function adminUserError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeUserId(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().includes("/") ||
    value.trim() === "." ||
    value.trim() === ".." ||
    Buffer.byteLength(value.trim(), "utf8") > 1500
  ) {
    throw adminUserError(
      "INVALID_ADMIN_USER_ID",
      "Invalid user ID",
      400,
    );
  }

  return value.trim();
}

function toIsoString(value) {
  if (!value || typeof value.toDate !== "function") {
    return null;
  }

  return value.toDate().toISOString();
}

// Explicitly select public fields; never spread stored user data.
function toClientAdminUser(userDoc) {
  const user = userDoc.data();

  return {
    id: userDoc.id,
    fullName: user.fullName ?? null,
    email: user.email ?? null,
    phone: user.phone ?? null,
    role: user.role ?? null,
    isActive: user.isActive === true,
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
  };
}

function ensureActiveAdmin(userDoc) {
  if (!userDoc.exists) {
    throw adminUserError(
      "ADMIN_USER_AUTH_REQUIRED",
      "Authenticated user no longer exists",
      401,
    );
  }

  const user = userDoc.data();

  if (user.isActive !== true) {
    throw adminUserError(
      "ADMIN_USER_ACCOUNT_INACTIVE",
      "Account is inactive",
      403,
    );
  }

  if (user.role !== "admin") {
    throw adminUserError(
      "ADMIN_USER_ROLE_FORBIDDEN",
      "Only admins can manage users",
      403,
    );
  }
}

function normalizeAdminUserUpdate(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw adminUserError(
      "INVALID_ADMIN_USER_UPDATE",
      "Update body must be an object",
      400,
    );
  }

  const fields = Object.keys(body);

  if (
    fields.length === 0 ||
    fields.some(
      (field) => !["role", "isActive"].includes(field),
    )
  ) {
    throw adminUserError(
      "INVALID_ADMIN_USER_UPDATE",
      "Provide only role and/or isActive",
      400,
    );
  }

  const update = {};

  if (Object.hasOwn(body, "role")) {
    if (!ALLOWED_USER_ROLES.includes(body.role)) {
      throw adminUserError(
        "INVALID_ADMIN_USER_UPDATE",
        "Role must be resident, rescue or admin",
        400,
      );
    }

    update.role = body.role;
  }

  if (Object.hasOwn(body, "isActive")) {
    if (typeof body.isActive !== "boolean") {
      throw adminUserError(
        "INVALID_ADMIN_USER_UPDATE",
        "isActive must be a boolean",
        400,
      );
    }

    update.isActive = body.isActive;
  }

  return update;
}

async function getActiveAdmin(actorId) {
  const normalizedActorId = normalizeUserId(actorId);

  const actorDoc = await db
    .collection(USERS_COLLECTION)
    .doc(normalizedActorId)
    .get();

  ensureActiveAdmin(actorDoc);

  return normalizedActorId;
}

async function listUsersForAdmin(actorId) {
  await getActiveAdmin(actorId);

  const snapshot = await db
    .collection(USERS_COLLECTION)
    .get();

  return snapshot.docs
    .map(toClientAdminUser)
    .sort((first, second) => first.id.localeCompare(second.id));
}

async function getUserDetailForAdmin(actorId, userId) {
  await getActiveAdmin(actorId);

  const normalizedUserId = normalizeUserId(userId);

  const userDoc = await db
    .collection(USERS_COLLECTION)
    .doc(normalizedUserId)
    .get();

  if (!userDoc.exists) {
    throw adminUserError(
      "ADMIN_USER_NOT_FOUND",
      "User not found",
      404,
    );
  }

  return toClientAdminUser(userDoc);
}

async function updateUserForAdmin(actorId, userId, body) {
  const normalizedActorId = normalizeUserId(actorId);
  const normalizedUserId = normalizeUserId(userId);
  const update = normalizeAdminUserUpdate(body);

  const actorRef = db
    .collection(USERS_COLLECTION)
    .doc(normalizedActorId);

  const userRef = db
    .collection(USERS_COLLECTION)
    .doc(normalizedUserId);

  const changedFields = await db.runTransaction(
    async (transaction) => {
      const actorDoc = await transaction.get(actorRef);
      ensureActiveAdmin(actorDoc);

      if (normalizedActorId === normalizedUserId) {
        throw adminUserError(
          "ADMIN_USER_SELF_UPDATE_FORBIDDEN",
          "Admins cannot change their own role or account status",
          403,
        );
      }

      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw adminUserError(
          "ADMIN_USER_NOT_FOUND",
          "User not found",
          404,
        );
      }

      const existing = userDoc.data();

      const changes = Object.keys(update).filter(
        (field) => existing[field] !== update[field],
      );

      if (changes.length === 0) {
        return [];
      }

      transaction.update(userRef, {
        ...update,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return changes;
    },
  );

  // Log only committed changes, outside the retryable transaction.
  if (changedFields.length > 0) {
    await logAuditEvent({
      actor: {
        id: normalizedActorId,
        role: "admin",
      },
      action: "user.update",
      target: {
        type: "user",
        id: normalizedUserId,
      },
      metadata: {
        source: "api",
        outcome: "success",
        changedFields,
      },
    });
  }

  const updatedDoc = await userRef.get();

  if (!updatedDoc.exists) {
    throw adminUserError(
      "ADMIN_USER_NOT_FOUND",
      "User not found",
      404,
    );
  }

  return toClientAdminUser(updatedDoc);
}

module.exports = {
  ALLOWED_USER_ROLES,
  normalizeAdminUserUpdate,
  listUsersForAdmin,
  getUserDetailForAdmin,
  updateUserForAdmin,
};