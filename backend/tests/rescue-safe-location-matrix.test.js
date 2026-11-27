"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRescueSafeLocationMatrixController,
} = require("../src/controllers/rescue-safe-location-matrix.controller");

const origin = {
  latitude: 16.05,
  longitude: 108.17,
};

const point = {
  latitude: 16.06,
  longitude: 108.18,
};

function response() {
  return {
    code: 200,
    body: null,
    set() {
      return this;
    },
    status(value) {
      this.code = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function controller(overrides = {}) {
  return createRescueSafeLocationMatrixController({
    findUser: async () => ({
      role: "rescue",
      isActive: true,
    }),
    findLocation: async (id) => ({
      id,
      location: point,
    }),
    estimateBatch: async ({ destinations }) => ({
      results: destinations.map((row) => ({
        requestId: row.requestId,
        distanceMeters: 1200,
      })),
    }),
    ...overrides,
  });
}

async function call(handler, body, user = { id: "rescue-1" }) {
  const res = response();
  await handler({ user, body }, res);
  return res;
}

test("34 locations use one batch and trusted coordinates", async () => {
  const ids = Array.from(
    { length: 34 },
    (_, i) => `LOC-${i}`,
  );

  let calls = 0;

  const result = await call(
    controller({
      estimateBatch: async (args) => {
        calls++;
        assert.equal(args.destinations.length, 34);
        assert.deepEqual(args.origin, origin);
        assert.equal(args.rescueId, "rescue-1");

        for (const row of args.destinations) {
          assert.deepEqual(row.destination, point);
        }

        return {
          results: args.destinations.map((row, i) => ({
            requestId: row.requestId,
            distanceMeters: 1200 + i,
          })),
        };
      },
    }),
    { origin, locationIds: ids },
  );

  assert.equal(result.code, 200);
  assert.equal(calls, 1);
  assert.equal(result.body.data.results.length, 34);
  assert.equal(result.body.data.provider, "openrouteservice");

  assert.deepEqual(result.body.data.results[0], {
    locationId: "LOC-0",
    destination: point,
    distanceMeters: 1200,
  });
});

test("missing authentication is rejected", async () => {
  const result = await call(
    controller(),
    { origin, locationIds: ["A"] },
    null,
  );

  assert.equal(result.code, 401);
});

test("resident and inactive Rescue are rejected", async () => {
  for (const user of [
    { role: "resident", isActive: true },
    { role: "rescue", isActive: false },
  ]) {
    const result = await call(
      controller({ findUser: async () => user }),
      { origin, locationIds: ["A"] },
    );

    assert.equal(result.code, 403);
  }
});

test("invalid origin, duplicate IDs and injected points are rejected", async () => {
  for (const body of [
    { origin, locationIds: ["A", "A"] },
    { origin, locationIds: [] },
    { origin, locationIds: ["A/B"] },
    {
      origin: { latitude: 99, longitude: 0 },
      locationIds: ["A"],
    },
    {
      origin,
      locationIds: ["A"],
      destinations: [point],
    },
    {
      origin,
      locationIds: Array.from(
        { length: 101 },
        (_, i) => `LOC-${i}`,
      ),
    },
  ]) {
    const result = await call(controller(), body);
    assert.equal(result.code, 400);
  }
});

test("deleted location has null distance", async () => {
  const result = await call(
    controller({
      findLocation: async (id) => {
        if (id === "B") {
          throw Object.assign(new Error("Not found"), {
            code: "SAFE_LOCATION_NOT_FOUND",
            statusCode: 404,
          });
        }
        return { id, location: point };
      },
    }),
    { origin, locationIds: ["A", "B"] },
  );

  assert.equal(result.code, 200);
  assert.equal(result.body.data.results[0].distanceMeters, 1200);

  assert.deepEqual(result.body.data.results[1], {
    locationId: "B",
    destination: null,
    distanceMeters: null,
  });
});

test("unreachable road remains null", async () => {
  const result = await call(
    controller({
      estimateBatch: async ({ destinations }) => ({
        results: destinations.map((row) => ({
          requestId: row.requestId,
          distanceMeters: null,
        })),
      }),
    }),
    { origin, locationIds: ["A"] },
  );

  assert.equal(result.code, 200);
  assert.equal(result.body.data.results[0].distanceMeters, null);
});

test("zero meters is a valid distance", async () => {
  const result = await call(
    controller({
      estimateBatch: async ({ destinations }) => ({
        results: destinations.map((row) => ({
          requestId: row.requestId,
          distanceMeters: 0,
        })),
      }),
    }),
    { origin, locationIds: ["A"] },
  );

  assert.equal(result.body.data.results[0].distanceMeters, 0);
});

test("provider rate limit returns 429 without fallback distance", async () => {
  const result = await call(
    controller({
      estimateBatch: async () => {
        throw Object.assign(new Error("Quota reached"), {
          code: "ROUTE_RATE_LIMITED",
          statusCode: 429,
        });
      },
    }),
    { origin, locationIds: ["A"] },
  );

  assert.equal(result.code, 429);
  assert.equal(result.body.success, false);
  assert.equal(result.body.data, undefined);
});

test("all missing locations do not call ORS", async () => {
  let calls = 0;

  const result = await call(
    controller({
      findLocation: async () => null,
      estimateBatch: async () => {
        calls++;
        return { results: [] };
      },
    }),
    { origin, locationIds: ["A"] },
  );

  assert.equal(result.code, 200);
  assert.equal(calls, 0);
  assert.equal(result.body.data.results[0].distanceMeters, null);
});