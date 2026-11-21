const { booleanPointInPolygon } = require("@turf/boolean-point-in-polygon");
const { pointToLineDistance } = require("@turf/point-to-line-distance");
const { hash } = require("./flood-warning-v2-contract");

let topology;
function topologyTools() {
  // JSTS is ESM; dynamic import also works with the Windows CommonJS backend.
  if (!topology) topology = Promise.all([
    import("jsts/org/locationtech/jts/io/GeoJSONReader.js"),
    import("jsts/org/locationtech/jts/operation/valid/IsValidOp.js"),
  ]).then(([reader, valid]) => ({ Reader: reader.default, Valid: valid.default }));
  return topology;
}
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
function coordinate(value) {
  if (!Array.isArray(value) || value.length < 2 || !Number.isFinite(value[0]) ||
      !Number.isFinite(value[1]) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) {
    throw new Error("Invalid coordinate");
  }
  return [value[0], value[1]];
}
function shape(input) {
  if (!input || typeof input !== "object") throw new Error("Missing geometry");
  if (input.type === "polygon") {
    if (!Array.isArray(input.points) || input.points.length < 3) throw new Error("Invalid polygon points");
    const ring = input.points.map((p) => coordinate([p?.longitude, p?.latitude]));
    if (!samePoint(ring[0], ring.at(-1))) ring.push([...ring[0]]);
    input = { type: "Polygon", coordinates: [ring] };
  }
  if (!["Polygon", "MultiPolygon"].includes(input.type) || !Array.isArray(input.coordinates)) {
    throw new Error("Only Polygon/MultiPolygon can define a region");
  }
  const polygons = input.type === "Polygon" ? [input.coordinates] : input.coordinates;
  if (!polygons.length) throw new Error("Empty geometry");
  let vertices = 0;
  const result = polygons.map((polygon) => {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error("Empty polygon");
    return polygon.map((value) => {
      if (!Array.isArray(value) || value.length < 4) throw new Error("Invalid ring");
      vertices += value.length;
      if (vertices > 100000) throw new Error("Geometry too complex");
      const ring = value.map(coordinate);
      if (!samePoint(ring[0], ring.at(-1))) throw new Error("GeoJSON ring must be closed");
      if (new Set(ring.slice(0, -1).map((p) => JSON.stringify(p))).size < 3) throw new Error("Too few distinct vertices");
      for (let i = 1; i < ring.length; i++) {
        if (samePoint(ring[i - 1], ring[i])) throw new Error("Repeated adjacent vertex");
        // GeoJSON shapes crossing the dateline need splitting before this regional engine.
        if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) throw new Error("Unsplit dateline geometry");
      }
      return ring;
    });
  });
  return { type: input.type, coordinates: input.type === "Polygon" ? result[0] : result };
}
function freeze(value) {
  if (value && typeof value === "object") { Object.freeze(value); for (const v of Object.values(value)) freeze(v); }
  return value;
}
function createGeometryNormalizer({ cacheSize = 512 } = {}) {
  const cache = new Map();
  return async function normalizeGeometry(input) {
    if (input === null || input === undefined) return { geometry: null, geometryStatus: "missing", reason: "missing_geometry" };
    const key = hash(input);
    if (cache.has(key)) {
      const found = cache.get(key); cache.delete(key); cache.set(key, found); return found;
    }
    const pending = (async () => {
      const { Reader, Valid } = await topologyTools();
      try {
        const geometry = shape(input);
        const parsed = new Reader().read(geometry);
        if (!new Valid(parsed).isValid() || parsed.isEmpty() || parsed.getArea() <= 0) throw new Error("Invalid polygon topology");
        return freeze({ geometry, geometryStatus: "valid", reason: null });
      } catch {
        // Invalid data is a coverage issue. Never invent a repaired outline.
        return freeze({ geometry: null, geometryStatus: "invalid", reason: "invalid_geometry" });
      }
    })();
    cache.set(key, pending);
    if (cache.size > cacheSize) cache.delete(cache.keys().next().value);
    try { return await pending; } catch (error) { cache.delete(key); throw error; }
  };
}

function relationToGeometry(location, geometry) {
  const point = [location.longitude, location.latitude];
  if (booleanPointInPolygon(point, geometry, { ignoreBoundary: false })) {
    return { relation: "inside", distanceToBoundaryM: null };
  }
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let distance = Infinity;
  for (const polygon of polygons) for (const ring of polygon) {
    distance = Math.min(distance, pointToLineDistance(point, { type: "LineString", coordinates: ring },
      { units: "meters", method: "geodesic" }));
  }
  if (!Number.isFinite(distance) || distance < 0) throw new Error("Invalid boundary distance");
  // Sub-micrometre numerical tolerance only, not a wider product radius.
  const near = distance <= 500 || Math.abs(distance - 500) <= 1e-7;
  return { relation: near ? "near" : "far", distanceToBoundaryM: near && distance > 500 ? 500 : distance };
}
module.exports = { createGeometryNormalizer, relationToGeometry };
