const {
  createSosWithHistory,
} = require("../services/create-sos.service");

const {
  getRescueRequestsForUser,
} = require("../services/rescue-request.service");

const {
  getUserById,
} = require("../services/user.service");

function toClientRescueRequest(request) {
  return {
    id: request.id,
    residentId: request.residentId,
    location: request.location,
    urgency: request.urgency,
    numberOfPeople: request.numberOfPeople,
    note: request.note,
    status: request.status,
    createdAt: request.createdAt.toDate().toISOString(),
    updatedAt: request.updatedAt.toDate().toISOString(),
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
      await getRescueRequestsForUser({
        id: req.user.id,
        role: user.role,
      });

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
    console.error("List rescue requests error:", error);

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
        rescueRequest: toClientRescueRequest(rescueRequest),
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

module.exports = {
  createSos,
  listRescueRequests,
  toClientRescueRequest,
};