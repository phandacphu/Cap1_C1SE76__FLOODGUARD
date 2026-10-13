const {
  getUserById,
} = require("./user.service");

const {
  getRescueRequestsForUser,
  getRescueRequestById,
} = require("./rescue-request.service");

const {
  getRescueAssignmentByRequestId,
} = require("./rescue-assignment.service");

const {
  getRescueRequestStatusHistoryByRequestId,
} = require("./rescue-request-status-history.service");

const ALLOWED_QUERY_FIELDS = [
  "status",
  "urgency",
  "severity",
  "sort",
];

function monitoringError(code, message, statusCode) {
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

async function authorizeAdmin(actorId) {
  if (!isValidDocumentId(actorId)) {
    throw monitoringError(
      "ADMIN_SOS_AUTH_REQUIRED",
      "Authentication is required",
      401,
    );
  }

  const normalizedActorId = actorId.trim();
  const user = await getUserById(normalizedActorId);

  if (!user) {
    throw monitoringError(
      "ADMIN_SOS_USER_NOT_FOUND",
      "Authenticated user no longer exists",
      401,
    );
  }

  if (user.isActive !== true) {
    throw monitoringError(
      "ADMIN_SOS_ACCOUNT_INACTIVE",
      "Account is inactive",
      403,
    );
  }

  if (user.role !== "admin") {
    throw monitoringError(
      "ADMIN_SOS_ROLE_FORBIDDEN",
      "Only admins can monitor all SOS requests",
      403,
    );
  }

  return {
    id: normalizedActorId,
    role: "admin",
  };
}

function validateQuery(query, allowedFields) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    throw monitoringError(
      "INVALID_ADMIN_SOS_QUERY",
      "Query parameters must be an object",
      400,
    );
  }

  const unsupportedField = Object.keys(query).find(
    (field) => !allowedFields.includes(field),
  );

  if (unsupportedField !== undefined) {
    throw monitoringError(
      "INVALID_ADMIN_SOS_QUERY",
      `Unsupported query parameter: ${unsupportedField}`,
      400,
    );
  }
}

function normalizeRequestId(requestId) {
  if (!isValidDocumentId(requestId)) {
    throw monitoringError(
      "INVALID_ADMIN_SOS_REQUEST_ID",
      "Invalid rescue request ID",
      400,
    );
  }

  return requestId.trim();
}

function toIsoString(value) {
  return value && typeof value.toDate === "function"
    ? value.toDate().toISOString()
    : null;
}

function toClientRequest(request) {
  return {
    id: request.id,
    residentId: request.residentId,
    location: request.location,
    urgency: request.urgency,
    numberOfPeople: request.numberOfPeople,
    note: request.note ?? null,
    status: request.status,
    createdAt: toIsoString(request.createdAt),
    updatedAt: toIsoString(request.updatedAt),
  };
}

function toClientAssignment(assignment) {
  if (!assignment) return null;

  return {
    id: assignment.id,
    requestId: assignment.requestId,
    rescueStaffId: assignment.rescueStaffId,
    status: assignment.status,
    note: assignment.note ?? null,
    assignedAt: toIsoString(assignment.assignedAt),
    updatedAt: toIsoString(assignment.updatedAt),
  };
}

function toClientHistory(history) {
  return {
    id: history.id,
    oldStatus: history.oldStatus ?? null,
    newStatus: history.newStatus,
    changedBy: history.changedBy,
    note: history.note ?? null,
    changedAt: toIsoString(history.changedAt),
  };
}

async function listSosRequestsForAdmin(
  actorId,
  query = {},
) {
  const admin = await authorizeAdmin(actorId);

  validateQuery(query, ALLOWED_QUERY_FIELDS);

  // Reuse existing filter validation and sorting.
  const rescueRequests =
    await getRescueRequestsForUser(admin, query);

  return rescueRequests.map(toClientRequest);
}

async function getSosRequestDetailForAdmin(
  actorId,
  requestId,
  query = {},
) {
  await authorizeAdmin(actorId);

  // Detail endpoint accepts no query parameters.
  validateQuery(query, []);

  const normalizedRequestId =
    normalizeRequestId(requestId);

  const rescueRequest =
    await getRescueRequestById(normalizedRequestId);

  if (!rescueRequest) {
    throw monitoringError(
      "ADMIN_SOS_REQUEST_NOT_FOUND",
      "Rescue request not found",
      404,
    );
  }

  // Related data is read only after authorization
  // and checking that the SOS exists.
  const [assignment, statusHistory] =
    await Promise.all([
      getRescueAssignmentByRequestId(
        normalizedRequestId,
      ),
      getRescueRequestStatusHistoryByRequestId(
        normalizedRequestId,
      ),
    ]);

  return {
    ...toClientRequest(rescueRequest),
    assignment: toClientAssignment(assignment),
    statusHistory: statusHistory.map(toClientHistory),
  };
}

module.exports = {
  listSosRequestsForAdmin,
  getSosRequestDetailForAdmin,
};