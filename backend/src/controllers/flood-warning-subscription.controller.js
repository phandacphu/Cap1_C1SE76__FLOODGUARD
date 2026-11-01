const {
  getFloodWarningSubscription,
  setFloodWarningSubscription,
} = require("../services/flood-warning-subscription.service");

function handleSubscriptionError(res, error) {
  const expectedCodes = new Set([
    "INVALID_SUBSCRIPTION_ID",
    "INVALID_SUBSCRIPTION_ENABLED",
    "SUBSCRIPTION_AUTH_REQUIRED",
    "SUBSCRIPTION_FORBIDDEN",
    "SUBSCRIPTION_AREA_NOT_FOUND",
  ]);

  if (expectedCodes.has(error.code)) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("[FloodWarningSubscription] REQUEST_FAILED");

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

function hasQueryParameters(req) {
  return Object.keys(req.query).length > 0;
}

async function getMyFloodWarningSubscription(req, res) {
  if (hasQueryParameters(req)) {
    return res.status(400).json({
      success: false,
      message: "Query parameters are not supported",
    });
  }

  try {
    const subscription = await getFloodWarningSubscription(
      req.user.id,
      req.params.areaId,
    );

    return res.status(200).json({
      success: true,
      message: "Flood warning subscription retrieved successfully",
      data: { subscription },
    });
  } catch (error) {
    return handleSubscriptionError(res, error);
  }
}

async function updateMyFloodWarningSubscription(req, res) {
  if (hasQueryParameters(req)) {
    return res.status(400).json({
      success: false,
      message: "Query parameters are not supported",
    });
  }

  const body = req.body;

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, "enabled") ||
    typeof body.enabled !== "boolean"
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide only enabled as a boolean",
    });
  }

  try {
    const subscription = await setFloodWarningSubscription(
      req.user.id,
      req.params.areaId,
      body.enabled,
    );

    return res.status(200).json({
      success: true,
      message: "Flood warning subscription updated successfully",
      data: { subscription },
    });
  } catch (error) {
    return handleSubscriptionError(res, error);
  }
}

module.exports = {
  getMyFloodWarningSubscription,
  updateMyFloodWarningSubscription,
};
