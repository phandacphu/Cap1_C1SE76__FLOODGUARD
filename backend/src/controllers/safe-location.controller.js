const {
  getSafeLocations,
  getNearbySafeLocations,
} = require("../services/safe-location.service");

function toClientService(service) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    isAvailable: service.isAvailable,
  };
}

function toClientSafeLocation(safeLocation) {
  return {
    id: safeLocation.id,
    name: safeLocation.name,
    address: safeLocation.address,
    location: safeLocation.location,
    type: safeLocation.type,
    capacity: safeLocation.capacity,
    capacityNote: safeLocation.capacityNote,
    description: safeLocation.description,
    contactPhone: safeLocation.contactPhone,
    status: safeLocation.status,
    services: safeLocation.services.map(toClientService),
  };
}

async function listSafeLocations(req, res) {
  try {
    const safeLocations = await getSafeLocations();

    return res.status(200).json({
      success: true,
      message: "Safe locations retrieved successfully",
      data: {
        safeLocations: safeLocations.map(
          toClientSafeLocation,
        ),
      },
    });
  } catch (error) {
    console.error("Get safe locations error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function listNearbySafeLocations(req, res) {
  try {
    const query = req.query || {};
    const allowedParameters = [
      "latitude",
      "longitude",
      "radiusKm",
      "type",
    ];

    const unsupportedParameter = Object.keys(query).find(
      (parameter) => !allowedParameters.includes(parameter),
    );

    if (unsupportedParameter !== undefined) {
      return res.status(400).json({
        success: false,
        message:
          `Unsupported query parameter: ${unsupportedParameter}`,
      });
    }

    if (
      query.latitude === undefined ||
      query.longitude === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Latitude and longitude query parameters are required",
      });
    }

    const safeLocations = await getNearbySafeLocations({
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radiusKm,
      type: query.type,
    });

    return res.status(200).json({
      success: true,
      message: "Nearby safe locations retrieved successfully",
      data: {
        safeLocations: safeLocations.map((safeLocation) => ({
          ...toClientSafeLocation(safeLocation),
          distanceKm: safeLocation.distanceKm,
        })),
      },
    });
  } catch (error) {
    if (error.code === "INVALID_NEARBY_FILTER") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Get nearby safe locations error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

module.exports = {
  listSafeLocations,
  listNearbySafeLocations,
  toClientSafeLocation,
};