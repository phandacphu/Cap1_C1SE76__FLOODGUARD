const {
  listFloodAreasForAdmin,
  getFloodAreaDetailForAdmin,
  createFloodAreaForAdmin,
  updateFloodAreaForAdmin,
  deleteFloodAreaForAdmin,
} = require("../services/admin-flood-area.service");

const {
  getFloodAreaSummaryStatisticsForAdmin,
} = require("../services/admin-flood-area-statistics.service");

function hasAuthenticatedUser(req, res) {
  if (!req.user || typeof req.user.id !== "string" || !req.user.id.trim()) {
    res.status(401).json({
      success: false,
      message: "Authentication is required",
    });

    return false;
  }

  return true;
}

function handleAreaError(res, error) {
  const errorStatuses = {
    INVALID_ADMIN_AREA_ID: 400,
    INVALID_ADMIN_AREA_DATA: 400,
    ADMIN_AREA_AUTH_REQUIRED: 401,
    ADMIN_AREA_ACCOUNT_INACTIVE: 403,
    ADMIN_AREA_ROLE_FORBIDDEN: 403,
    ADMIN_AREA_NOT_FOUND: 404,
    ADMIN_AREA_HAS_ALERTS: 409,
  };

  const statusCode = errorStatuses[error.code];

  if (statusCode) {
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("Admin flood area operation failed");

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

async function listAdminFloodAreas(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) return;

    const floodAreas = await listFloodAreasForAdmin(req.user.id);

    return res.status(200).json({
      success: true,
      message: "Flood areas retrieved successfully",
      data: {
        floodAreas,
      },
    });
  } catch (error) {
    return handleAreaError(res, error);
  }
}

async function getAdminFloodAreaDetail(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) return;

    const floodArea = await getFloodAreaDetailForAdmin(
      req.user.id,
      req.params.areaId,
    );

    return res.status(200).json({
      success: true,
      message: "Flood area retrieved successfully",
      data: {
        floodArea,
      },
    });
  } catch (error) {
    return handleAreaError(res, error);
  }
}

async function createAdminFloodArea(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) return;

    const floodArea = await createFloodAreaForAdmin(req.user.id, req.body);

    return res.status(201).json({
      success: true,
      message: "Flood area created successfully",
      data: {
        floodArea,
      },
    });
  } catch (error) {
    return handleAreaError(res, error);
  }
}

async function updateAdminFloodArea(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) return;

    const floodArea = await updateFloodAreaForAdmin(
      req.user.id,
      req.params.areaId,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Flood area updated successfully",
      data: {
        floodArea,
      },
    });
  } catch (error) {
    return handleAreaError(res, error);
  }
}

async function deleteAdminFloodArea(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) return;

    if (
      req.body !== undefined &&
      (req.body === null ||
        typeof req.body !== "object" ||
        Array.isArray(req.body) ||
        Object.keys(req.body).length > 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Delete body must be empty or an empty object",
      });
    }

    const result = await deleteFloodAreaForAdmin(
      req.user.id,
      req.params.areaId,
    );

    return res.status(200).json({
      success: true,
      message: "Flood area deleted successfully",
      data: {
        id: result.id,
      },
    });
  } catch (error) {
    return handleAreaError(res, error);
  }
}

async function getAdminFloodAreaSummaryStatistics(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) {
      return;
    }

    if (Object.keys(req.query || {}).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Query parameters are not supported",
      });
    }

    const summary = await getFloodAreaSummaryStatisticsForAdmin(req.user.id);

    return res.status(200).json({
      success: true,
      message: "Flood area statistics retrieved successfully",
      data: summary,
    });
  } catch (error) {
    return handleAreaError(res, error);
  }
}

module.exports = {
  listAdminFloodAreas,
  getAdminFloodAreaDetail,
  createAdminFloodArea,
  updateAdminFloodArea,
  deleteAdminFloodArea,
  getAdminFloodAreaSummaryStatistics,
};
