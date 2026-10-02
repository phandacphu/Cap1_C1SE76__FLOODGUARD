const {
  getWeatherAndFloodForecast,
} = require("../services/open-meteo.service");

function getErrorStatus(error) {
  if (
    error.message.startsWith("Latitude") ||
    error.message.startsWith("Longitude")
  ) {
    return 400;
  }

  if (error.message === "External API request timed out") {
    return 504;
  }

  if (
    error.message.startsWith(
      "External API returned status",
    ) ||
    error.message === "fetch failed"
  ) {
    return 502;
  }

  return 500;
}

function getClientErrorMessage(statusCode, error) {
  if (statusCode === 400) {
    return error.message;
  }

  if (statusCode === 504) {
    return "External forecast service timed out";
  }

  if (statusCode === 502) {
    return "External forecast service is unavailable";
  }

  return "Internal server error";
}

async function getFloodForecast(req, res) {
  try {
    const { latitude, longitude } = req.query;

    if (
      latitude === undefined ||
      longitude === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Latitude and longitude query parameters are required",
      });
    }

    const forecast =
      await getWeatherAndFloodForecast(
        latitude,
        longitude,
      );

    return res.status(200).json({
      success: true,
      message:
        "Weather and flood forecast retrieved successfully",
      data: forecast,
    });
  } catch (error) {
    const statusCode = getErrorStatus(error);

    console.error("Get flood forecast error:", error);

    return res.status(statusCode).json({
      success: false,
      message: getClientErrorMessage(
        statusCode,
        error,
      ),
    });
  }
}

module.exports = {
  getFloodForecast,
};