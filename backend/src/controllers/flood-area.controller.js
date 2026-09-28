const {
  getFloodAreas,
} = require("../services/flood-area.service");

async function listFloodAreas(req, res) {
  try {
    const floodAreas = await getFloodAreas();

    const clientFloodAreas = floodAreas.map((area) => ({
      id: area.id,
      name: area.name,
      description: area.description,
      geometry: area.geometry,
      severity: area.severity,
      status: area.status,
      source: area.source,
    }));

    return res.status(200).json({
      success: true,
      message: "Flood areas retrieved successfully",
      data: {
        floodAreas: clientFloodAreas,
      },
    });
  } catch (error) {
    console.error("Get flood areas error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

module.exports = {
  listFloodAreas,
};