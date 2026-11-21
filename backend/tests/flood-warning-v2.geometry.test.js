const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createGeometryNormalizer, relationToGeometry } = require("../src/services/warning-v2-geometry");
const h = require("./helpers/warning-v2-geography");

test("Admin point objects convert to closed lon/lat rings without mutating source", async () => {
  const original = h.adminGeometry(); const before = JSON.stringify(original);
  const result = await createGeometryNormalizer()(original);
  assert.equal(result.geometryStatus, "valid"); assert.deepEqual(result.geometry, h.square());
  assert.equal(JSON.stringify(original), before);
});
test("geometry validation rejects points, invalid rings, NaN/range, zero area and dateline crossings", async () => {
  const normalize = createGeometryNormalizer();
  const bad = [
    { type: "Point", coordinates: [0, 0] }, { type: "Polygon", coordinates: [] },
    { type: "Polygon", coordinates: [[[0, 0], [1, 0], [0, 1]]] },
    { type: "Polygon", coordinates: [[[0, 0], [1, 0], [2, 0], [0, 0]]] },
    { type: "Polygon", coordinates: [[[0, 0], [NaN, 0], [1, 1], [0, 0]]] },
    { type: "Polygon", coordinates: [[[0, 0], [181, 0], [1, 1], [0, 0]]] },
    { type: "Polygon", coordinates: [[[179, 0], [-179, 0], [-179, 1], [179, 0]]] },
    { type: "polygon", points: [{ latitude: 0, longitude: 0 }] },
  ];
  for (const g of bad) assert.equal((await normalize(g)).geometryStatus, "invalid");
  assert.equal((await normalize(null)).geometryStatus, "missing");
});
test("topology validation catches bow ties, repeated vertices and invalid holes", async () => {
  const normalize = createGeometryNormalizer();
  const outer = h.square(0, 0, 1).coordinates[0];
  for (const coordinates of [
    [[[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]],
    [[[0, 0], [1, 0], [1, 0], [1, 1], [0, 0]]],
    [outer, h.square(2, 2, 0.1).coordinates[0]],
    [outer, h.square(0.9, 0.1, 0.2).coordinates[0]],
    [outer, h.square(0.2, 0.2, 0.5).coordinates[0], h.square(0.3, 0.3, 0.1).coordinates[0]],
  ]) assert.equal((await normalize({ type: "Polygon", coordinates })).geometryStatus, "invalid");
});
test("inside, edge and vertex all classify inside before computing outside distance", async () => {
  const g = (await createGeometryNormalizer()(h.square())).geometry;
  for (const location of [{ latitude: -0.025, longitude: 0.025 }, { latitude: 0, longitude: 0.025 }, { latitude: 0, longitude: 0 }]) {
    assert.deepEqual(relationToGeometry(location, g), { relation: "inside", distanceToBoundaryM: null });
  }
});
test("499/500/501m use the nearest segment, not centroid or nearest vertex", async () => {
  const g = (await createGeometryNormalizer()(h.square())).geometry;
  for (const metres of [499, 500, 500.001, 501]) {
    // Analytic distance north of an equatorial segment, independent of the code under test.
    const latitude = metres / h.EARTH_RADIUS_M * 180 / Math.PI;
    const result = relationToGeometry({ latitude, longitude: 0.025 }, g);
    assert.equal(result.relation, metres <= 500 ? "near" : "far");
    assert.ok(Math.abs(result.distanceToBoundaryM - metres) < 1e-6);
    if (metres <= 500) assert.ok(result.distanceToBoundaryM <= 500);
  }
});
test("holes exclude their interior, include the boundary and provide nearest inner-ring distance", async () => {
  const geometry = { type: "Polygon", coordinates: [h.square(-0.05, -0.05, 0.1).coordinates[0], h.square(-0.02, -0.02, 0.04).coordinates[0]] };
  const result = await createGeometryNormalizer()(geometry); assert.equal(result.geometryStatus, "valid");
  assert.equal(relationToGeometry({ latitude: 0, longitude: 0 }, result.geometry).relation, "far");
  assert.equal(relationToGeometry({ latitude: 0, longitude: -0.02 }, result.geometry).relation, "inside");
  const near = relationToGeometry({ latitude: 0, longitude: -0.019 }, result.geometry);
  assert.equal(near.relation, "near"); assert.ok(near.distanceToBoundaryM > 110 && near.distanceToBoundaryM < 112);
});
test("MultiPolygon checks every island and rejects overlapping components", async () => {
  const normalize = createGeometryNormalizer();
  const good = await normalize({ type: "MultiPolygon", coordinates: [h.square().coordinates, h.square(1, 1).coordinates] });
  assert.equal(good.geometryStatus, "valid");
  assert.equal(relationToGeometry({ latitude: 1.025, longitude: 1.025 }, good.geometry).relation, "inside");
  const bad = await normalize({ type: "MultiPolygon", coordinates: [h.square(0, 0, 1).coordinates, h.square(0.2, 0.2, 0.2).coordinates] });
  assert.equal(bad.geometryStatus, "invalid");
});
test("normalization cache is bounded and cannot be poisoned by changing the returned outline", async () => {
  const normalize = createGeometryNormalizer({ cacheSize: 2 });
  const a = await normalize(h.square());
  assert.ok(Object.isFrozen(a.geometry.coordinates[0][0]));
  a.geometry.coordinates[0][0][0] = 99;
  assert.equal((await normalize(h.square())).geometry.coordinates[0][0][0], 0);
  await normalize(h.square(1, 1)); await normalize(h.square(2, 2));
  assert.equal((await normalize(h.square())).geometryStatus, "valid");
});
