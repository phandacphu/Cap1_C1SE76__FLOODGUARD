const {
  getActiveFloodAlerts,
  getFloodAlerts,
} = require("../services/flood-alert.service");

async function listActiveFloodAlerts(req, res) {
  try {
    const floodAlerts = await getActiveFloodAlerts();

    const clientFloodAlerts = floodAlerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      content: alert.content,
      severity: alert.severity,
      status: alert.status,
      areaId: alert.areaId,
      startAt: alert.startAt.toDate().toISOString(),
      endAt: alert.endAt.toDate().toISOString(),
    }));

    return res.status(200).json({
      success: true,
      message: "Active flood warnings retrieved successfully",
      data: {
        floodAlerts: clientFloodAlerts,
      },
    });
  } catch (error) {
    console.error(
      "Get active flood warnings error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function listFloodAlerts(req, res) {
  try {
    const allowedQueryParameters = [
      "areaId",
      "severity",
      "status",
    ];

    const unsupportedParameter = Object.keys(req.query).find(
      (parameter) =>
        !allowedQueryParameters.includes(parameter),
    );

    if (unsupportedParameter) {
      return res.status(400).json({
        success: false,
        message: `Unsupported query parameter: ${unsupportedParameter}`,
      });
    }

    const floodAlerts = await getFloodAlerts(req.query);

    const clientFloodAlerts = floodAlerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      content: alert.content,
      severity: alert.severity,
      status: alert.status,
      areaId: alert.areaId,
      startAt: alert.startAt.toDate().toISOString(),
      endAt: alert.endAt.toDate().toISOString(),
    }));

    return res.status(200).json({
      success: true,
      message: "Flood warnings retrieved successfully",
      data: {
        floodAlerts: clientFloodAlerts,
      },
    });
  } catch (error) {
    if (
      error.message === "Invalid areaId filter" ||
      error.message === "Invalid severity filter" ||
      error.message === "Invalid status filter"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Get flood warnings error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

module.exports = {
  listActiveFloodAlerts,
  listFloodAlerts,
};