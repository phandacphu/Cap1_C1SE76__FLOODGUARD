const assert = require("assert");
const {
  Timestamp,
} = require("firebase-admin/firestore");

const firebasePath = require.resolve(
  "../src/config/firebase",
);

const fixedNow = Timestamp.fromDate(
  new Date("2026-09-30T06:00:00.000Z"),
);

let simulateDatabaseError = false;

function createDocument(id, data) {
  return {
    id,
    data: () => data,
  };
}

const documents = [
  createDocument("expired-critical", {
    title: "Expired critical warning",
    content: "Expired",
    severity: "critical",
    status: "active",
    areaId: "area-01",
    startAt: Timestamp.fromDate(
      new Date("2026-09-29T00:00:00.000Z"),
    ),
    endAt: Timestamp.fromDate(
      new Date("2026-09-29T12:00:00.000Z"),
    ),
  }),
  createDocument("future-critical", {
    title: "Future critical warning",
    content: "Future",
    severity: "critical",
    status: "active",
    areaId: "area-01",
    startAt: Timestamp.fromDate(
      new Date("2026-10-01T00:00:00.000Z"),
    ),
    endAt: Timestamp.fromDate(
      new Date("2026-10-02T00:00:00.000Z"),
    ),
  }),
  createDocument("active-high-old", {
    title: "Older high warning",
    content: "Active",
    severity: "high",
    status: "active",
    areaId: "area-01",
    startAt: Timestamp.fromDate(
      new Date("2026-09-30T03:00:00.000Z"),
    ),
    endAt: Timestamp.fromDate(
      new Date("2099-12-31T23:59:59.000Z"),
    ),
  }),
  createDocument("active-critical", {
    title: "Active critical warning",
    content: "Active",
    severity: "critical",
    status: "active",
    areaId: "area-01",
    startAt: Timestamp.fromDate(
      new Date("2026-09-30T01:00:00.000Z"),
    ),
    endAt: Timestamp.fromDate(
      new Date("2099-12-31T23:59:59.000Z"),
    ),
  }),
  createDocument("active-high-new", {
    title: "Newer high warning",
    content: "Active",
    severity: "high",
    status: "active",
    areaId: "area-01",
    startAt: Timestamp.fromDate(
      new Date("2026-09-30T05:00:00.000Z"),
    ),
    endAt: Timestamp.fromDate(
      new Date("2099-12-31T23:59:59.000Z"),
    ),
  }),
];

const db = {
  collection(collectionName) {
    assert.strictEqual(collectionName, "flood_alerts");

    return {
      where(field, operator, value) {
        assert.strictEqual(field, "status");
        assert.strictEqual(operator, "==");
        assert.strictEqual(value, "active");

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
  getActiveFloodAlerts,
} = require("../src/services/flood-alert.service");
const {
  listActiveFloodAlerts,
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
  const activeAlerts =
    await getActiveFloodAlerts(fixedNow);

  assert.deepStrictEqual(
    activeAlerts.map((alert) => alert.id),
    [
      "active-critical",
      "active-high-new",
      "active-high-old",
    ],
  );

  const successResponse = createResponse();

  await listActiveFloodAlerts({}, successResponse);

  assert.strictEqual(successResponse.statusCode, 200);
  assert.strictEqual(successResponse.body.success, true);
  assert.ok(
    Array.isArray(
      successResponse.body.data.floodAlerts,
    ),
  );
  assert.strictEqual(
    typeof successResponse.body.data.floodAlerts[0]
      .startAt,
    "string",
  );

  simulateDatabaseError = true;

  const errorResponse = createResponse();
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await listActiveFloodAlerts({}, errorResponse);
  } finally {
    console.error = originalConsoleError;
  }

  assert.strictEqual(errorResponse.statusCode, 500);
  assert.strictEqual(errorResponse.body.success, false);
  assert.strictEqual(
    errorResponse.body.message,
    "Internal server error",
  );

  console.log("Active flood warnings tests passed");
}

runTests().catch((error) => {
  console.error("Active flood warnings tests failed");
  console.error(error);
  process.exit(1);
});