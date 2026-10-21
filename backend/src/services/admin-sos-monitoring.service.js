const { getUserById } = require("./user.service");

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

const ALLOWED_QUERY_FIELDS = ["status", "urgency", "severity", "sort"];

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
  if (!query || typeof query !== "object" || Array.isArray(query)) {
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

// CCF-158: Validate ISO 8601 datetime filters.
function parseDateFilter(value, fieldName) {
  if (value === undefined) {
    return null;
  }

  const pattern =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

  const match = typeof value === "string" ? value.match(pattern) : null;

  if (!match) {
    throw monitoringError(
      "INVALID_ADMIN_SOS_QUERY",
      `${fieldName} must be an ISO 8601 datetime with timezone`,
      400,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

  const offsetHour = match[10] ? Number(match[10]) : 0;

  const offsetMinute = match[11] ? Number(match[11]) : 0;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  const validDate =
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (daysInMonth[month - 1] || 0) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59;

  if (!validDate) {
    throw monitoringError(
      "INVALID_ADMIN_SOS_QUERY",
      `Invalid ${fieldName} datetime`,
      400,
    );
  }

  const milliseconds = Date.parse(value);

  if (!Number.isFinite(milliseconds)) {
    throw monitoringError(
      "INVALID_ADMIN_SOS_QUERY",
      `Invalid ${fieldName} datetime`,
      400,
    );
  }

  return milliseconds;
}

// CCF-158: Get summary statistics for Admin dashboard.
async function getSosSummaryStatisticsForAdmin(actorId, query = {}) {
  const admin = await authorizeAdmin(actorId);

  validateQuery(query, ["from", "to"]);

  const from = parseDateFilter(query.from, "from");
  const to = parseDateFilter(query.to, "to");

  if (from !== null && to !== null && from > to) {
    throw monitoringError(
      "INVALID_ADMIN_SOS_QUERY",
      "from must be earlier than or equal to to",
      400,
    );
  }

  const requests = await getRescueRequestsForUser(admin, {});

  const summary = {
    total: 0,
    byStatus: {
      submitted: 0,
      received: 0,
      in_progress: 0,
      assisted: 0,
      cancelled: 0,
    },
    byUrgency: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
  };

  for (const request of requests) {
    if (from !== null || to !== null) {
      const createdAt =
        request.createdAt && typeof request.createdAt.toMillis === "function"
          ? request.createdAt.toMillis()
          : NaN;

      if (!Number.isFinite(createdAt)) {
        continue;
      }

      if (from !== null && createdAt < from) {
        continue;
      }

      if (to !== null && createdAt > to) {
        continue;
      }
    }

    summary.total++;

    if (Object.hasOwn(summary.byStatus, request.status)) {
      summary.byStatus[request.status]++;
    }

    if (Object.hasOwn(summary.byUrgency, request.urgency)) {
      summary.byUrgency[request.urgency]++;
    }
  }

  return summary;
}

// Existing Admin SOS Monitoring: List requests.
async function listSosRequestsForAdmin(actorId, query = {}) {
  const admin = await authorizeAdmin(actorId);

  validateQuery(query, ALLOWED_QUERY_FIELDS);

  // Reuse existing filter validation and sorting.
  const rescueRequests = await getRescueRequestsForUser(admin, query);

  return rescueRequests.map(toClientRequest);
}

// Existing Admin SOS Monitoring: Request detail.
async function getSosRequestDetailForAdmin(actorId, requestId, query = {}) {
  await authorizeAdmin(actorId);

  // Detail endpoint accepts no query parameters.
  validateQuery(query, []);

  const normalizedRequestId = normalizeRequestId(requestId);

  const rescueRequest = await getRescueRequestById(normalizedRequestId);

  if (!rescueRequest) {
    throw monitoringError(
      "ADMIN_SOS_REQUEST_NOT_FOUND",
      "Rescue request not found",
      404,
    );
  }

  // Related data is read only after authorization
  // and checking that the SOS exists.
  const [assignment, statusHistory] = await Promise.all([
    getRescueAssignmentByRequestId(normalizedRequestId),
    getRescueRequestStatusHistoryByRequestId(normalizedRequestId),
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
  getSosSummaryStatisticsForAdmin,
};
