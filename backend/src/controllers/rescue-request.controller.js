const {
  createSosWithHistory,
} = require("../services/create-sos.service");

const {
  getRescueRequestById,
  getRescueRequestsForUser,
} = require("../services/rescue-request.service");

const {
  getRescueRequestStatusHistoryByRequestId,
} = require(
  "../services/rescue-request-status-history.service",
);

const {
  getUserById,
} = require("../services/user.service");

const {
  acceptRescueRequestWithHistory,
} = require("../services/accept-rescue-request.service");

function toClientRescueRequest(request) {
  return {
    id: request.id,
    residentId: request.residentId,
    location: request.location,
    urgency: request.urgency,
    numberOfPeople: request.numberOfPeople,
    note: request.note,
    status: request.status,
    createdAt: request.createdAt
      .toDate()
      .toISOString(),
    updatedAt: request.updatedAt
      .toDate()
      .toISOString(),
  };
}

function toClientStatusHistory(history) {
  return {
    id: history.id,
    oldStatus: history.oldStatus,
    newStatus: history.newStatus,
    changedBy: history.changedBy,
    note: history.note,
    changedAt: history.changedAt
      .toDate()
      .toISOString(),
  };
}

async function listRescueRequests(req, res) {
  try {
    if (
      !req.user ||
      typeof req.user.id !== "string" ||
      !req.user.id.trim()
    ) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user no longer exists",
      });
    }

    if (user.isActive !== true) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
    }

    const rescueRequests =
  await getRescueRequestsForUser(
    {
      id: req.user.id,
      role: user.role,
    },
    req.query,
  );

    return res.status(200).json({
      success: true,
      message: "Rescue requests retrieved successfully",
      data: {
        rescueRequests: rescueRequests.map(
          toClientRescueRequest,
        ),
      },
    });
    } catch (error) {
    if (
      error.code ===
      "INVALID_RESCUE_REQUEST_FILTER"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("List rescue requests error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function getRescueRequestDetail(req, res) {
  try {
    if (
      !req.user ||
      typeof req.user.id !== "string" ||
      !req.user.id.trim()
    ) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user no longer exists",
      });
    }

    if (user.isActive !== true) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
    }

    const requestId = req.params.requestId;

    if (
      typeof requestId !== "string" ||
      !requestId.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Rescue request ID is required",
      });
    }

    const rescueRequest =
      await getRescueRequestById(requestId.trim());

    if (!rescueRequest) {
      return res.status(404).json({
        success: false,
        message: "Rescue request not found",
      });
    }

    if (
      user.role === "resident" &&
      rescueRequest.residentId !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to access this rescue request",
      });
    }

    const statusHistory =
      await getRescueRequestStatusHistoryByRequestId(
        rescueRequest.id,
      );

    return res.status(200).json({
      success: true,
      message: "Rescue request retrieved successfully",
      data: {
        rescueRequest: {
          ...toClientRescueRequest(rescueRequest),
          statusHistory: statusHistory.map(
            toClientStatusHistory,
          ),
        },
      },
    });
  } catch (error) {
    console.error(
      "Get rescue request detail error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function createSos(req, res) {
  try {
    if (
      !req.user ||
      typeof req.user.id !== "string" ||
      !req.user.id.trim()
    ) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user no longer exists",
      });
    }

    if (user.isActive !== true) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
    }

    if (user.role !== "resident") {
      return res.status(403).json({
        success: false,
        message: "Only residents can create SOS requests",
      });
    }

    const rescueRequest = await createSosWithHistory(
      req.user.id,
      req.body,
    );

    return res.status(201).json({
      success: true,
      message: "SOS request created successfully",
      data: {
        rescueRequest: toClientRescueRequest(
          rescueRequest,
        ),
      },
    });
  } catch (error) {
    if (error.code === "DUPLICATE_SOS_REQUEST") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "INVALID_SOS_INPUT") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Create SOS error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function acceptRescueRequest(req, res) {
  try {
    if (
      !req.user ||
      typeof req.user.id !== "string" ||
      !req.user.id.trim()
    ) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    // This endpoint accepts no client-controlled fields.
    // The staff ID comes from the verified JWT.
    if (
      req.body !== undefined &&
      (
        req.body === null ||
        typeof req.body !== "object" ||
        Array.isArray(req.body) ||
        Object.keys(req.body).length > 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Accept rescue request body must be empty or an empty object",
      });
    }

    const result =
      await acceptRescueRequestWithHistory(
        req.params.requestId,
        req.user.id,
      );

    const assignment = result.assignment;

    return res.status(200).json({
      success: true,
      message: "Rescue request accepted successfully",
      data: {
        rescueRequest: toClientRescueRequest(
          result.rescueRequest,
        ),
        assignment: {
          id: assignment.id,
          requestId: assignment.requestId,
          rescueStaffId: assignment.rescueStaffId,
          status: assignment.status,
          note: assignment.note,
          assignedAt: assignment.assignedAt
            .toDate()
            .toISOString(),
          updatedAt: assignment.updatedAt
            .toDate()
            .toISOString(),
        },
      },
    });
  } catch (error) {
    const errorStatuses = {
      ACCEPT_AUTH_REQUIRED: 401,
      ACCEPT_USER_NOT_FOUND: 401,
      ACCEPT_ACCOUNT_INACTIVE: 403,
      ACCEPT_ROLE_FORBIDDEN: 403,
      INVALID_ACCEPT_REQUEST_ID: 400,
      ACCEPT_REQUEST_NOT_FOUND: 404,
      ACCEPT_REQUEST_UNAVAILABLE: 409,
    };

    const statusCode = errorStatuses[error.code];

    if (statusCode) {
      return res.status(statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Accept rescue request error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

module.exports = {
  createSos,
  listRescueRequests,
  getRescueRequestDetail,
  acceptRescueRequest,
  toClientRescueRequest,
  toClientStatusHistory,
};