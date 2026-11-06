const assert = require("node:assert/strict");
const express = require("express");

const floodHistoryRoutes = require("../src/routes/flood-history.routes");

async function runTests() {
  const app = express();
  app.use("/api/flood-history", floodHistoryRoutes);

  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const expected = {
      points: 27,
      buffers: 2,
      radar: 157,
    };

    for (const [layer, count] of Object.entries(expected)) {
      const response = await fetch(`${baseUrl}/api/flood-history/${layer}`);

      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.layer, layer);
      assert.equal(body.data.geojson.type, "FeatureCollection");
      assert.equal(body.data.geojson.features.length, count);

      console.log(`PASS HTTP ${layer}: ${count} features`);
    }

    const invalidResponse = await fetch(`${baseUrl}/api/flood-history/unknown`);

    assert.equal(invalidResponse.status, 404);
    console.log("PASS unknown route: HTTP 404");

    const buffersResponse = await fetch(`${baseUrl}/api/flood-history/buffers`);

    const buffersBody = await buffersResponse.json();

    const radii = buffersBody.data.geojson.features
      .map((feature) => feature.properties.radius_m)
      .sort((a, b) => a - b);

    assert.deepEqual(radii, [220, 450]);
    console.log("PASS HTTP buffer radii: 220m, 450m");

    for (const layer of Object.keys(expected)) {
      const response = await fetch(`${baseUrl}/api/flood-history/${layer}`);

      const body = await response.json();

      for (const feature of body.data.geojson.features) {
        assert.notEqual(feature.properties?.current_flood_alert, true);
        assert.notEqual(feature.properties?.verified_flood_polygon, true);
      }
    }

    console.log("PASS historical data safety flags");
    console.log("Flood history HTTP API tests passed");
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }
}

runTests().catch((error) => {
  console.error("Flood history HTTP API tests failed");
  console.error(error);
  process.exitCode = 1;
});
