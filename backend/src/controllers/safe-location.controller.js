const {
  getSafeLocations,
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

module.exports = {
  listSafeLocations,
  toClientSafeLocation,
};