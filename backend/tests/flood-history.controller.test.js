const assert = require("node:assert/strict");

const servicePath = require.resolve("../src/services/flood-history.service");

let getFloodHistoryImplementation;

require.cache[servicePath] = {
  id: servicePath,
  filename: servicePath,
  loaded: true,
  exports: {
    getFloodHistoryGeoJSON: (...args) => getFloodHistoryImplementation(...args),
  },
};

const {
  listHistoricalFloodPoints,
  listHistoricalFloodBuffers,
  listHistoricalFloodRadar,
} = require("../src/controllers/flood-history.controller");

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const testCases = [
  ["points", listHistoricalFloodPoints],
  ["buffers", listHistoricalFloodBuffers],
  ["radar", listHistoricalFloodRadar],
];

async function testSuccess() {
  for (const [layer, handler] of testCases) {
    const expectedGeoJSON = {
      type: "FeatureCollection",
      features: [],
    };

    let requestedLayer = null;

    getFloodHistoryImplementation = async (name) => {
      requestedLayer = name;
      return expectedGeoJSON;
    };

    const res = createResponse();

    await handler({}, res);

    assert.equal(requestedLayer, layer);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.layer, layer);
    assert.deepEqual(res.body.data.geojson, expectedGeoJSON);

    console.log(`PASS controller ${layer}: HTTP 200`);
  }
}

async function testServiceError() {
  for (const [layer, handler] of testCases) {
    getFloodHistoryImplementation = async () => {
      throw new Error("Simulated service error");
    };

    const res = createResponse();
    const originalConsoleError = console.error;

    console.error = () => {};

    try {
      await handler({}, res);
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Internal server error");

    assert.equal(res.body.data, undefined);

    console.log(`PASS controller ${layer}: HTTP 500`);
  }
}

async function runTests() {
  await testSuccess();
  await testServiceError();

  console.log("Flood history controller tests passed");
}

runTests().catch((error) => {
  console.error("Flood history controller tests failed");
  console.error(error);
  process.exitCode = 1;
});
