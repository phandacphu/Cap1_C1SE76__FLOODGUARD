const {
  listFloodAlertsForAdmin,
  getFloodAlertDetailForAdmin,
  createFloodAlertForAdmin,
  updateFloodAlertForAdmin,
} = require("../services/admin-flood-alert.service");

function hasAuthenticatedUser(req, res) {
  if (
    !req.user ||
    typeof req.user.id !== "string" ||
    !req.user.id.trim()
  ) {
    res.status(401).json({
      success: false,
      message: "Authentication is required",
    });

    return false;
  }

  return true;
}

function handleError(res, error, operation) {
  const errorStatuses = {
    INVALID_ADMIN_ALERT_ID: 400,
    INVALID_ADMIN_ALERT_DATA: 400,
    ADMIN_ALERT_AUTH_REQUIRED: 401,
    ADMIN_ALERT_ACCOUNT_INACTIVE: 403,
    ADMIN_ALERT_ROLE_FORBIDDEN: 403,
    ADMIN_ALERT_NOT_FOUND: 404,
    ADMIN_ALERT_AREA_NOT_FOUND: 404,
  };

  const statusCode = errorStatuses[error.code];

  if (statusCode) {
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }

  // Avoid logging request bodies or raw database errors.
  console.error(`Admin flood warning ${operation} failed`);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

async function listAdminFloodAlerts(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) {
      return;
    }

    // Filtering is not part of this Admin endpoint yet.
    if (Object.keys(req.query || {}).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Query parameters are not supported",
      });
    }

    const floodAlerts = await listFloodAlertsForAdmin(
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      message: "Flood warnings retrieved successfully",
      data: {
        floodAlerts,
      },
    });
  } catch (error) {
    return handleError(res, error, "list");
  }
}

async function getAdminFloodAlertDetail(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) {
      return;
    }

    const floodAlert = await getFloodAlertDetailForAdmin(
      req.user.id,
      req.params.alertId,
    );

    return res.status(200).json({
      success: true,
      message: "Flood warning retrieved successfully",
      data: {
        floodAlert,
      },
    });
  } catch (error) {
    return handleError(res, error, "detail");
  }
}

async function createAdminFloodAlert(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) {
      return;
    }

    const floodAlert = await createFloodAlertForAdmin(
      req.user.id,
      req.body,
    );

    return res.status(201).json({
      success: true,
      message: "Flood warning created successfully",
      data: {
        floodAlert,
      },
    });
  } catch (error) {
    return handleError(res, error, "create");
  }
}

async function updateAdminFloodAlert(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) {
      return;
    }

    const floodAlert = await updateFloodAlertForAdmin(
      req.user.id,
      req.params.alertId,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Flood warning updated successfully",
      data: {
        floodAlert,
      },
    });
  } catch (error) {
    return handleError(res, error, "update");
  }
}

module.exports = {
  listAdminFloodAlerts,
  getAdminFloodAlertDetail,
  createAdminFloodAlert,
  updateAdminFloodAlert,
};