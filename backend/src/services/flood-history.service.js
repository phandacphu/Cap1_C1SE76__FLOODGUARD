const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "../../data/flood-history");

const LAYER_FILES = {
  points: "FLOODGUARD_FLOODMAP.geojson",
  buffers: "FLOODGUARD_FLOODMAP_BUFFERS.geojson",
  radar: "FLOODGUARD_FLOODMAP_RADAR.geojson",
};

const cache = new Map();

async function getFloodHistoryGeoJSON(layer) {
  if (!Object.prototype.hasOwnProperty.call(LAYER_FILES, layer)) {
    throw new Error("Invalid flood history layer");
  }

  if (cache.has(layer)) {
    return cache.get(layer);
  }

  const filePath = path.join(DATA_DIR, LAYER_FILES[layer]);
  const content = await fs.readFile(filePath, "utf8");
  const geojson = JSON.parse(content);

  if (
    geojson.type !== "FeatureCollection" ||
    !Array.isArray(geojson.features)
  ) {
    throw new Error("Invalid GeoJSON FeatureCollection");
  }

  cache.set(layer, geojson);

  return geojson;
}

module.exports = {
  getFloodHistoryGeoJSON,
};
