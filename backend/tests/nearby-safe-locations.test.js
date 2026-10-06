const assert = require("node:assert/strict");

const firebasePath = require.resolve("../src/config/firebase");
let simulateDatabaseError = false;

function document(id, data) {
  return { id, data: () => data };
}

function locationDocument(
  id,
  longitude,
  type = "shelter",
  status = "active",
) {
  return document(id, {
    name: id,
    address: "Sample address",
    location: { latitude: 0, longitude },
    type,
    status,
    capacity: 100,
  });
}

const locations = [
  locationDocument("far", 0.2),
  locationDocument("near", 0.01),
  locationDocument("inactive", 0, "shelter", "inactive"),
  locationDocument("hospital", 0.02, "hospital"),
  locationDocument("outside", 2),
  locationDocument("invalid-coordinate", NaN),
];

const services = [
  document("water", {
    safeLocationId: "near",
    name: "drinking_water",
    description: "Sample water service",
    isAvailable: true,
  }),
];

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    db: {
      collection(name) {
        assert.ok(
          ["safe_locations", "safe_location_services"].includes(name),
        );

        return {
          async get() {
            if (simulateDatabaseError) {
              throw new Error("Simulated database failure");
            }

            return {
              docs: name === "safe_locations" ? locations : services,
            };
          },
        };
      },
    },
  },
};

const {
  calculateDistanceKm,
  normalizeNearbySafeLocationFilters,
  getNearbySafeLocations,
} = require("../src/services/safe-location.service");

const {
  listNearbySafeLocations,
} = require("../src/controllers/safe-location.controller");

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

async function callController(query) {
  const response = createResponse();
  await listNearbySafeLocations({ query }, response);
  return response;
}

async function runTests() {
  const origin = { latitude: 0, longitude: 0 };

  assert.equal(calculateDistanceKm(origin, origin), 0);

  // One degree of longitude at the equator is about 111.195 km.
  const distance = calculateDistanceKm(origin, {
    latitude: 0,
    longitude: 1,
  });
  assert.ok(Math.abs(distance - 111.195) < 0.01);

  const defaults = normalizeNearbySafeLocationFilters({
    latitude: "0",
    longitude: "0",
  });
  assert.equal(defaults.latitude, 0);
  assert.equal(defaults.longitude, 0);
  assert.equal(defaults.radiusKm, 10);

  for (const invalidFilter of [
    { latitude: "" },
    { latitude: "91" },
    { latitude: ["0", "1"] },
    { latitude: NaN },
    { longitude: "181" },
    { longitude: "Infinity" },
    { radiusKm: "0" },
    { radiusKm: "-1" },
    { radiusKm: "101" },
    { type: "unknown" },
  ]) {
    assert.throws(
      () => normalizeNearbySafeLocationFilters({
        latitude: "0",
        longitude: "0",
        ...invalidFilter,
      }),
      (error) => error.code === "INVALID_NEARBY_FILTER",
    );
  }

  const nearby = await getNearbySafeLocations({
    ...origin,
    radiusKm: 30,
  });

  assert.deepEqual(
    nearby.map((location) => location.id),
    ["near", "hospital", "far"],
  );
  assert.ok(Math.abs(nearby[0].distanceKm - 1.11195) < 0.001);
  assert.equal(nearby[0].services[0].id, "water");

  const shelters = await getNearbySafeLocations({
    ...origin,
    radiusKm: 30,
    type: "shelter",
  });
  assert.deepEqual(
    shelters.map((location) => location.id),
    ["near", "far"],
  );

  const withinTwoKm = await getNearbySafeLocations({
    ...origin,
    radiusKm: 2,
  });
  assert.deepEqual(
    withinTwoKm.map((location) => location.id),
    ["near"],
  );

  const empty = await getNearbySafeLocations({
    ...origin,
    radiusKm: 0.1,
  });
  assert.deepEqual(empty, []);

  const success = await callController({
    latitude: "0",
    longitude: "0",
    radiusKm: "30",
  });
  assert.equal(success.statusCode, 200);
  assert.equal(success.body.success, true);
  assert.deepEqual(
    success.body.data.safeLocations.map((location) => location.id),
    ["near", "hospital", "far"],
  );
  assert.equal(
    typeof success.body.data.safeLocations[0].distanceKm,
    "number",
  );
  assert.equal(
    success.body.data.safeLocations[0].services[0].name,
    "drinking_water",
  );

  for (const query of [
    {},
    { latitude: "91", longitude: "0" },
    { latitude: "0", longitude: "0", radiusKm: "0" },
    { latitude: ["0", "1"], longitude: "0" },
    { latitude: "0", longitude: "0", type: "unknown" },
    { latitude: "0", longitude: "0", unsupported: "value" },
  ]) {
    const response = await callController(query);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
  }

  const emptyResponse = await callController({
    latitude: "0",
    longitude: "0",
    radiusKm: "0.1",
  });
  assert.equal(emptyResponse.statusCode, 200);
  assert.deepEqual(emptyResponse.body.data.safeLocations, []);

  simulateDatabaseError = true;
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const response = await callController({
      latitude: "0",
      longitude: "0",
    });
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, "Internal server error");
  } finally {
    console.error = originalConsoleError;
    simulateDatabaseError = false;
  }

  console.log("Nearby safe locations tests passed");
}

runTests().catch((error) => {
  console.error("Nearby safe locations tests failed");
  console.error(error);
  process.exitCode = 1;
});