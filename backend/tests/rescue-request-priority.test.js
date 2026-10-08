const assert = require("node:assert/strict");
const { Timestamp } = require("firebase-admin/firestore");

const firebasePath = require.resolve(
  "../src/config/firebase",
);

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    db: {
      collection() {
        return {
          doc() {
            return {
              async get() {
                return {
                  exists: false,
                  data: () => undefined,
                };
              },
            };
          },
        };
      },
    },
  },
};

const {
  compareRescueRequests,
  normalizeRescueRequestFilters,
} = require("../src/services/rescue-request.service");

const requests = [
  {
    id: "request-low",
    urgency: "low",
    createdAt: Timestamp.fromDate(
      new Date("2026-10-09T00:04:00.000Z"),
    ),
  },
  {
    id: "request-critical",
    urgency: "critical",
    createdAt: Timestamp.fromDate(
      new Date("2026-10-09T00:01:00.000Z"),
    ),
  },
  {
    id: "request-medium",
    urgency: "medium",
    createdAt: Timestamp.fromDate(
      new Date("2026-10-09T00:03:00.000Z"),
    ),
  },
  {
    id: "request-high",
    urgency: "high",
    createdAt: Timestamp.fromDate(
      new Date("2026-10-09T00:02:00.000Z"),
    ),
  },
];

const prioritySorted = [...requests].sort(
  (firstRequest, secondRequest) =>
    compareRescueRequests(
      firstRequest,
      secondRequest,
      "priority",
    ),
);

assert.deepEqual(
  prioritySorted.map((request) => request.id),
  [
    "request-critical",
    "request-high",
    "request-medium",
    "request-low",
  ],
);

const newestSorted = [...requests].sort(
  (firstRequest, secondRequest) =>
    compareRescueRequests(
      firstRequest,
      secondRequest,
      "newest",
    ),
);

assert.deepEqual(
  newestSorted.map((request) => request.id),
  [
    "request-low",
    "request-medium",
    "request-high",
    "request-critical",
  ],
);

const oldestSorted = [...requests].sort(
  (firstRequest, secondRequest) =>
    compareRescueRequests(
      firstRequest,
      secondRequest,
      "oldest",
    ),
);

assert.deepEqual(
  oldestSorted.map((request) => request.id),
  [
    "request-critical",
    "request-high",
    "request-medium",
    "request-low",
  ],
);

assert.deepEqual(
  normalizeRescueRequestFilters({
    sort: "priority",
  }),
  {
    status: null,
    urgency: null,
    sort: "priority",
  },
);

assert.deepEqual(
  normalizeRescueRequestFilters({}),
  {
    status: null,
    urgency: null,
    sort: "newest",
  },
);

assert.throws(
  () =>
    normalizeRescueRequestFilters({
      sort: "random",
    }),
  (error) =>
    error.code ===
    "INVALID_RESCUE_REQUEST_FILTER",
);

console.log(
  "Rescue request priority tests passed",
);