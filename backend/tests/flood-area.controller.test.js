const assert = require("assert");

const servicePath = require.resolve(
  "../src/services/flood-area.service",
);

let getFloodAreasImplementation;

require.cache[servicePath] = {
  id: servicePath,
  filename: servicePath,
  loaded: true,
  exports: {
    getFloodAreas: (...args) =>
      getFloodAreasImplementation(...args),
  },
};

const {
  listFloodAreas,
} = require("../src/controllers/flood-area.controller");

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

async function testListFloodAreasSuccess() {
  getFloodAreasImplementation = async () => [
    {
      id: "area-01",
      name: "Test Flood Area",
      description: "Test description",
      geometry: {
        type: "polygon",
        points: [
          { latitude: 16.05, longitude: 108.2 },
          { latitude: 16.06, longitude: 108.21 },
          { latitude: 16.04, longitude: 108.22 },
        ],
      },
      severity: "high",
      status: "active",
      source: "test",
      createdAt: "must-not-be-returned",
      updatedAt: "must-not-be-returned",
    },
  ];

  const res = createResponse();

  await listFloodAreas({}, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.floodAreas.length, 1);
  assert.strictEqual(
    res.body.data.floodAreas[0].id,
    "area-01",
  );
  assert.strictEqual(
    res.body.data.floodAreas[0].createdAt,
    undefined,
  );
  assert.strictEqual(
    res.body.data.floodAreas[0].updatedAt,
    undefined,
  );
}

async function testListFloodAreasEmpty() {
  getFloodAreasImplementation = async () => [];

  const res = createResponse();

  await listFloodAreas({}, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.deepStrictEqual(res.body.data.floodAreas, []);
}

async function testListFloodAreasDatabaseError() {
  getFloodAreasImplementation = async () => {
    throw new Error("Simulated database error");
  };

  const res = createResponse();
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await listFloodAreas({}, res);
  } finally {
    console.error = originalConsoleError;
  }

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(
    res.body.message,
    "Internal server error",
  );
}

async function runTests() {
  await testListFloodAreasSuccess();
  await testListFloodAreasEmpty();
  await testListFloodAreasDatabaseError();

  console.log("Flood area controller tests passed");
}

runTests().catch((error) => {
  console.error("Flood area controller tests failed");
  console.error(error);
  process.exit(1);
});