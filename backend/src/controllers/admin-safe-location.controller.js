const {
  listSafeLocationsForAdmin,
  getSafeLocationDetailForAdmin,
  createSafeLocationForAdmin,
  updateSafeLocationForAdmin,
} = require("../services/admin-safe-location.service");

const ERROR_STATUSES = {
  ADMIN_SAFE_AUTH_REQUIRED: 401,
  ADMIN_SAFE_USER_NOT_FOUND: 401,
  ADMIN_SAFE_ACCOUNT_INACTIVE: 403,
  ADMIN_SAFE_ROLE_FORBIDDEN: 403,
  INVALID_ADMIN_SAFE_LOCATION_ID: 400,
  INVALID_ADMIN_SAFE_LOCATION_DATA: 400,
  ADMIN_SAFE_LOCATION_NOT_FOUND: 404,
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

function ensureNoQuery(req, res) {
  if (Object.keys(req.query || {}).length > 0) {
    res.status(400).json({
      success: false,
      message: "Query parameters are not supported",
    });

    return false;
  }

  return true;
}

async function listAdminSafeLocations(req, res) {
  try {
    if (!ensureAuthenticated(req, res)) return;
    if (!ensureNoQuery(req, res)) return;

    const safeLocations =
      await listSafeLocationsForAdmin(req.user.id);

    return res.status(200).json({
      success: true,
      message: "Safe locations retrieved successfully",
      data: { safeLocations },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "List admin safe locations",
    );
  }
}

async function getAdminSafeLocationDetail(req, res) {
  try {
    if (!ensureAuthenticated(req, res)) return;
    if (!ensureNoQuery(req, res)) return;

    const safeLocation =
      await getSafeLocationDetailForAdmin(
        req.user.id,
        req.params.locationId,
      );

    return res.status(200).json({
      success: true,
      message: "Safe location retrieved successfully",
      data: { safeLocation },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Get admin safe location detail",
    );
  }
}

async function createAdminSafeLocation(req, res) {
  try {
    if (!ensureAuthenticated(req, res)) return;
    if (!ensureNoQuery(req, res)) return;

    const safeLocation =
      await createSafeLocationForAdmin(
        req.user.id,
        req.body,
      );

    return res.status(201).json({
      success: true,
      message: "Safe location created successfully",
      data: { safeLocation },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Create admin safe location",
    );
  }
}

async function updateAdminSafeLocation(req, res) {
  try {
    if (!ensureAuthenticated(req, res)) return;
    if (!ensureNoQuery(req, res)) return;

    const safeLocation =
      await updateSafeLocationForAdmin(
        req.user.id,
        req.params.locationId,
        req.body,
      );

    return res.status(200).json({
      success: true,
      message: "Safe location updated successfully",
      data: { safeLocation },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Update admin safe location",
    );
  }
}

module.exports = {
  listAdminSafeLocations,
  getAdminSafeLocationDetail,
  createAdminSafeLocation,
  updateAdminSafeLocation,
};