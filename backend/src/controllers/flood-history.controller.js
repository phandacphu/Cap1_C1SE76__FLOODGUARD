const { getFloodHistoryGeoJSON } = require("../services/flood-history.service");

async function sendFloodHistoryLayer(res, layer) {
  try {
    const geojson = await getFloodHistoryGeoJSON(layer);

    return res.status(200).json({
      success: true,
      message: `Historical flood ${layer} retrieved successfully`,
      data: {
        layer,
        geojson,
      },
    });
  } catch (error) {
    console.error(`Get flood history ${layer} error:`, error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function listHistoricalFloodPoints(req, res) {
  return sendFloodHistoryLayer(res, "points");
}

async function listHistoricalFloodBuffers(req, res) {
  return sendFloodHistoryLayer(res, "buffers");
}

async function listHistoricalFloodRadar(req, res) {
  return sendFloodHistoryLayer(res, "radar");
}

module.exports = {
  listHistoricalFloodPoints,
  listHistoricalFloodBuffers,
  listHistoricalFloodRadar,
};
