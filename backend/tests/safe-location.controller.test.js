const assert = require("assert");

const firebasePath = require.resolve(
  "../src/config/firebase",
);

let simulateDatabaseError = false;

let locationDocuments = [
  {
    id: "location-b",
    data: () => ({
      name: "Safe Location B",
      address: "Address B",
      location: {
        latitude: 16.06,
        longitude: 108.21,
      },
      type: "school",
      capacity: 200,
      capacityNote: null,
      description: "Location B",
      contactPhone: null,
      status: "active",
    }),
  },
  {
    id: "location-a",
    data: () => ({
      name: "Safe Location A",
      address: "Address A",
      location: {
        latitude: 16.05,
        longitude: 108.2,
      },
      type: "shelter",
      capacity: 100,
      capacityNote: "Sample capacity",
      description: "Location A",
      contactPhone: "02361234567",
      status: "active",
    }),
  },
];

let serviceDocuments = [
  {
    id: "service-water",
    data: () => ({
      safeLocationId: "location-a",
      name: "drinking_water",
      description: "Water support",
      isAvailable: true,
    }),
  },
];

const db = {
  collection(collectionName) {
    return {
      async get() {
        if (simulateDatabaseError) {
          throw new Error("Simulated database error");
        }

        if (collectionName === "safe_locations") {
          return {
            docs: locationDocuments,
          };
        }

        if (
          collectionName === "safe_location_services"
        ) {
          return {
            docs: serviceDocuments,
          };
        }

        throw new Error(
          `Unexpected collection: ${collectionName}`,
        );
      },
    };
  },
};

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    db,
  },
};

const {
  getSafeLocations,
} = require("../src/services/safe-location.service");

const {
  listSafeLocations,
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

async function runTests() {
  const safeLocations = await getSafeLocations();

  assert.deepStrictEqual(
    safeLocations.map((safeLocation) => safeLocation.id),
    ["location-a", "location-b"],
  );

  assert.strictEqual(
    safeLocations[0].services.length,
    1,
  );

  assert.strictEqual(
    safeLocations[0].services[0].name,
    "drinking_water",
  );

  assert.deepStrictEqual(
    safeLocations[1].services,
    [],
  );

  const successResponse = createResponse();

  await listSafeLocations({}, successResponse);

  assert.strictEqual(successResponse.statusCode, 200);
  assert.strictEqual(successResponse.body.success, true);
  assert.strictEqual(
    successResponse.body.message,
    "Safe locations retrieved successfully",
  );
  assert.ok(
    Array.isArray(
      successResponse.body.data.safeLocations,
    ),
  );
  assert.strictEqual(
    successResponse.body.data.safeLocations.length,
    2,
  );
  assert.strictEqual(
    successResponse.body.data.safeLocations[0].id,
    "location-a",
  );
  assert.strictEqual(
    successResponse.body.data.safeLocations[0]
      .createdAt,
    undefined,
  );

  locationDocuments = [];
  serviceDocuments = [];

  const emptyResponse = createResponse();

  await listSafeLocations({}, emptyResponse);

  assert.strictEqual(emptyResponse.statusCode, 200);
  assert.strictEqual(emptyResponse.body.success, true);
  assert.deepStrictEqual(
    emptyResponse.body.data.safeLocations,
    [],
  );

  simulateDatabaseError = true;

  const errorResponse = createResponse();
  const originalConsoleError = console.error;

  console.error = () => {};

  try {
    await listSafeLocations({}, errorResponse);
  } finally {
    console.error = originalConsoleError;
  }

  assert.strictEqual(errorResponse.statusCode, 500);
  assert.strictEqual(errorResponse.body.success, false);
  assert.strictEqual(
    errorResponse.body.message,
    "Internal server error",
  );

  console.log("Safe location controller tests passed");
}

runTests().catch((error) => {
  console.error("Safe location controller tests failed");
  console.error(error);
  process.exit(1);
});