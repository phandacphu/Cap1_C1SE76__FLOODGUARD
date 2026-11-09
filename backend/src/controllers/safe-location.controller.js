const {
  getSafeLocations,
  getNearbySafeLocations,
  getSafeLocationDetail,
} = require("../services/safe-location.service");
const { toClientSafeLocation } = require("../services/safe-location-contract");

function handleError(res, error) {
  const statuses = {
    INVALID_SAFE_LOCATION_QUERY: 400,
    INVALID_SAFE_LOCATION_ID: 400,
    SAFE_LOCATION_NOT_FOUND: 404,
  };
  const status = statuses[error.code];
  if (status)
    return res
      .status(status)
      .json({ success: false, message: error.message, code: error.code });
  console.error("Safe location read failed");
  return res
    .status(500)
    .json({ success: false, message: "Internal server error" });
}

async function listSafeLocations(req, res) {
  try {
    const safeLocations = await getSafeLocations(req.query || {});
    return res
      .status(200)
      .json({
        success: true,
        message: "Safe locations retrieved successfully",
        data: { safeLocations },
      });
  } catch (error) {
    return handleError(res, error);
  }
}

async function listNearbySafeLocations(req, res) {
  try {
    const safeLocations = await getNearbySafeLocations(req.query || {});
    return res
      .status(200)
      .json({
        success: true,
        message: "Safe locations retrieved successfully",
        data: { safeLocations },
      });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getSafeLocation(req, res) {
  try {
    const safeLocation = await getSafeLocationDetail(
      req.params.locationId,
      req.query || {},
    );
    return res
      .status(200)
      .json({
        success: true,
        message: "Safe location retrieved successfully",
        data: { safeLocation },
      });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  listSafeLocations,
  listNearbySafeLocations,
  getSafeLocation,
  toClientSafeLocation,
};
