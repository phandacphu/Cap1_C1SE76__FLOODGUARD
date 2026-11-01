const assert = require("node:assert/strict");
const fs = require("node:fs/promises");

const servicePath = require.resolve("../src/services/flood-history.service");

const { getFloodHistoryGeoJSON } = require(servicePath);

async function testRealData() {
  const expected = {
    points: 27,
    buffers: 2,
    radar: 157,
  };

  for (const [layer, count] of Object.entries(expected)) {
    const data = await getFloodHistoryGeoJSON(layer);

    assert.equal(data.type, "FeatureCollection");
    assert.equal(data.features.length, count);

    for (const feature of data.features) {
      assert.equal(feature.type, "Feature");
      assert.ok(feature.geometry);
    }

    console.log(`PASS ${layer}: ${count} features`);
  }
}

async function testBufferRadii() {
  const data = await getFloodHistoryGeoJSON("buffers");

  const radii = data.features
    .map((feature) => feature.properties.radius_m)
    .sort((a, b) => a - b);

  assert.deepEqual(radii, [220, 450]);

  for (const feature of data.features) {
    assert.equal(feature.geometry.type, "MultiPolygon");
    assert.equal(feature.properties.display_only, true);
    assert.equal(feature.properties.current_flood_alert, false);
    assert.equal(feature.properties.verified_flood_polygon, false);
  }

  console.log("PASS buffer metadata: 220m and 450m");
}

async function testCache() {
  const first = await getFloodHistoryGeoJSON("points");
  const second = await getFloodHistoryGeoJSON("points");

  assert.strictEqual(first, second);

  console.log("PASS service cache");
}

async function testInvalidLayer() {
  await assert.rejects(
    () => getFloodHistoryGeoJSON("unknown"),
    /Invalid flood history layer/,
  );

  console.log("PASS invalid layer");
}

async function testMockedFileError() {
  const originalReadFile = fs.readFile;

  try {
    fs.readFile = async () => {
      const error = new Error("File not found");
      error.code = "ENOENT";
      throw error;
    };

    delete require.cache[servicePath];
    const isolatedService = require(servicePath);

    await assert.rejects(
      () => isolatedService.getFloodHistoryGeoJSON("points"),
      { code: "ENOENT" },
    );

    console.log("PASS missing file handling");
  } finally {
    fs.readFile = originalReadFile;
    delete require.cache[servicePath];
  }
}

async function testInvalidGeoJSON() {
  const originalReadFile = fs.readFile;

  try {
    fs.readFile = async () =>
      JSON.stringify({
        type: "FeatureCollection",
        features: "invalid",
      });

    delete require.cache[servicePath];
    const isolatedService = require(servicePath);

    await assert.rejects(
      () => isolatedService.getFloodHistoryGeoJSON("radar"),
      /Invalid GeoJSON FeatureCollection/,
    );

    console.log("PASS invalid GeoJSON handling");
  } finally {
    fs.readFile = originalReadFile;
    delete require.cache[servicePath];
  }
}

async function runTests() {
  await testRealData();
  await testBufferRadii();
  await testCache();
  await testInvalidLayer();
  await testMockedFileError();
  await testInvalidGeoJSON();

  console.log("Flood history service tests passed");
}

runTests().catch((error) => {
  console.error("Flood history service tests failed");
  console.error(error);
  process.exitCode = 1;
});
