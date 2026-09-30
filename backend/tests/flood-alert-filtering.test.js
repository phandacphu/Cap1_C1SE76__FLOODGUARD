const assert = require("assert");
const {
  Timestamp,
} = require("firebase-admin/firestore");

const firebasePath = require.resolve(
  "../src/config/firebase",
);

let simulateDatabaseError = false;

function createDocument(id, data) {
  return {
    id,
    data: () => data,
  };
}

const documents = [
  createDocument("area-01-high-active", {
    title: "High active warning",
    content: "Active warning for area 01",
    severity: "high",
    status: "active",
    areaId: "area-01",
    startAt: Timestamp.fromDate(
      new Date("2026-09-30T05:00:00.000Z"),
    ),
    endAt: Timestamp.fromDate(
      new Date("2026-10-01T05:00:00.000Z"),
    ),
  }),
  createDocument("area-02-high-inactive", {
    title: "High inactive warning",
    content: "Inactive warning for area 02",
    severity: "high",
    status: "inactive",
    areaId: "area-02",
    startAt: Timestamp.fromDate(
      new Date("2026-09-30T04:00:00.000Z"),
    ),
    endAt: Timestamp.fromDate(
      new Date("2026-10-01T04:00:00.000Z"),
    ),
  }),
  createDocument("area-01-low-active", {
    title: "Low active warning",
    content: "Low warning for area 01",
    severity: "low",
    status: "active",
    areaId: "area-01",
    startAt: Timestamp.fromDate(
      new Date("2026-09-30T03:00:00.000Z"),
    ),
    endAt: Timestamp.fromDate(
      new Date("2026-10-01T03:00:00.000Z"),
    ),
  }),
];

const db = {
  collection(collectionName) {
    assert.strictEqual(collectionName, "flood_alerts");

    return {
      async get() {
        if (simulateDatabaseError) {
          throw new Error("Simulated database error");
        }

        return {
          docs: documents,
        };
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
  getFloodAlerts,
  normalizeFloodAlertFilters,
} = require("../src/services/flood-alert.service");
const {
  listFloodAlerts,
} = require("../src/controllers/flood-alert.controller");

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
  const allAlerts = await getFloodAlerts();

  assert.strictEqual(allAlerts.length, 3);
  assert.deepStrictEqual(
    allAlerts.map((alert) => alert.id),
    [
      "area-01-high-active",
      "area-02-high-inactive",
      "area-01-low-active",
    ],
  );

  const filteredAlerts = await getFloodAlerts({
    areaId: "area-01",
    severity: "high",
    status: "active",
  });

  assert.deepStrictEqual(
    filteredAlerts.map((alert) => alert.id),
    ["area-01-high-active"],
  );

  const noMatches = await getFloodAlerts({
    areaId: "missing-area",
  });

  assert.deepStrictEqual(noMatches, []);

  assert.throws(
    () =>
      normalizeFloodAlertFilters({
        severity: "unknown",
      }),
    /Invalid severity filter/,
  );

  assert.throws(
    () =>
      normalizeFloodAlertFilters({
        status: "unknown",
      }),
    /Invalid status filter/,
  );

  assert.throws(
    () =>
      normalizeFloodAlertFilters({
        areaId: "",
      }),
    /Invalid areaId filter/,
  );

  const successResponse = createResponse();

  await listFloodAlerts(
    {
      query: {
        areaId: "area-01",
        severity: "high",
        status: "active",
      },
    },
    successResponse,
  );

  assert.strictEqual(successResponse.statusCode, 200);
  assert.strictEqual(successResponse.body.success, true);
  assert.strictEqual(
    successResponse.body.data.floodAlerts.length,
    1,
  );
  assert.strictEqual(
    successResponse.body.data.floodAlerts[0].id,
    "area-01-high-active",
  );
  assert.strictEqual(
    typeof successResponse.body.data.floodAlerts[0]
      .startAt,
    "string",
  );

  const invalidFilterResponse = createResponse();

  await listFloodAlerts(
    {
      query: {
        severity: "unknown",
      },
    },
    invalidFilterResponse,
  );

  assert.strictEqual(
    invalidFilterResponse.statusCode,
    400,
  );
  assert.strictEqual(
    invalidFilterResponse.body.message,
    "Invalid severity filter",
  );

  const unsupportedFilterResponse = createResponse();

  await listFloodAlerts(
    {
      query: {
        level: "high",
      },
    },
    unsupportedFilterResponse,
  );

  assert.strictEqual(
    unsupportedFilterResponse.statusCode,
    400,
  );
  assert.strictEqual(
    unsupportedFilterResponse.body.message,
    "Unsupported query parameter: level",
  );

  simulateDatabaseError = true;

  const errorResponse = createResponse();
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await listFloodAlerts(
      {
        query: {},
      },
      errorResponse,
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.strictEqual(errorResponse.statusCode, 500);
  assert.strictEqual(errorResponse.body.success, false);
  assert.strictEqual(
    errorResponse.body.message,
    "Internal server error",
  );

  console.log("Flood warning filtering tests passed");
}

runTests().catch((error) => {
  console.error("Flood warning filtering tests failed");
  console.error(error);
  process.exit(1);
});