const {
  listSosRequestsForAdmin,
  getSosRequestDetailForAdmin,
  getSosSummaryStatisticsForAdmin,
} = require("../services/admin-sos-monitoring.service");

const ERROR_STATUSES = {
  ADMIN_SOS_AUTH_REQUIRED: 401,
  ADMIN_SOS_USER_NOT_FOUND: 401,
  ADMIN_SOS_ACCOUNT_INACTIVE: 403,
  ADMIN_SOS_ROLE_FORBIDDEN: 403,
  INVALID_ADMIN_SOS_QUERY: 400,
  INVALID_ADMIN_SOS_REQUEST_ID: 400,
  INVALID_RESCUE_REQUEST_FILTER: 400,
  ADMIN_SOS_REQUEST_NOT_FOUND: 404,
};

function handleError(res, error, operation) {
  const statusCode = ERROR_STATUSES[error.code];

  if (statusCode) {
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error(`${operation} error:`, error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

function ensureAuthenticated(req, res) {
  if (!req.user || typeof req.user.id !== "string" || !req.user.id.trim()) {
    res.status(401).json({
      success: false,
      message: "Authentication is required",
    });

    return false;
  }

  return true;
}

async function listAdminSosRequests(req, res) {
  try {
    if (!ensureAuthenticated(req, res)) return;

    const rescueRequests = await listSosRequestsForAdmin(
      req.user.id,
      req.query,
    );

    return res.status(200).json({
      success: true,
      message: "SOS requests retrieved successfully",
      data: {
        rescueRequests,
      },
    });
  } catch (error) {
    return handleError(res, error, "List admin SOS requests");
  }
}

async function getAdminSosRequestDetail(req, res) {
  try {
    if (!ensureAuthenticated(req, res)) return;

    const rescueRequest = await getSosRequestDetailForAdmin(
      req.user.id,
      req.params.requestId,
      req.query,
    );

    return res.status(200).json({
      success: true,
      message: "SOS request retrieved successfully",
      data: {
        rescueRequest,
      },
    });
  } catch (error) {
    return handleError(res, error, "Get admin SOS request detail");
  }
}

// CCF-158: Summary statistics for Admin dashboard.
async function getAdminSosSummaryStatistics(req, res) {
  try {
    if (!ensureAuthenticated(req, res)) return;

    const summary = await getSosSummaryStatisticsForAdmin(
      req.user.id,
      req.query,
    );

    return res.status(200).json({
      success: true,
      message: "SOS summary statistics retrieved successfully",
      data: summary,
    });
  } catch (error) {
    return handleError(res, error, "Get admin SOS summary statistics");
  }
}

module.exports = {
  listAdminSosRequests,
  getAdminSosRequestDetail,
  getAdminSosSummaryStatistics,
};
