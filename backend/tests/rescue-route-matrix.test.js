"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRescueRouteMatrixService } = require("../src/services/rescue-route-matrix.service");
const { createRescueRouteMatrixController } = require("../src/controllers/rescue-route-matrix.controller");

const origin = { latitude: 16.0544, longitude: 108.2022 };
const p1 = { latitude: 16.06, longitude: 108.21 };
const p2 = { latitude: 16.07, longitude: 108.22 };
const destinations = [{ requestId: "SOS-A", destination: p1 }, { requestId: "SOS-B", destination: p2 }];
const input = { origin, rescueId: "RESCUE-1", destinations };
const data = { distances: [[1240.2, 3800.6]] };
function service(options = {}) {
  let calls = 0;
  const requests = [];
  const impl = createRescueRouteMatrixService({
    apiKeyProvider: () => "fake-test-key",
    fetchImplementation: async (url, init) => {
      calls++;
      requests.push({ url, init });
      return { ok: true, json: async () => data };
    },
    ...options,
  });
  return { impl, requests, get calls() { return calls; } };
}
function res() { return { code: 200, status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; } }; }
const rescuers = { role: "rescue", isActive: true };
function controller(options = {}) {
  return createRescueRouteMatrixController({
    findUser: async () => rescuers,
    findRequest: async (id) => ({ location: id === "SOS-A" ? p1 : p2 }),
    estimateBatch: async ({ destinations: rows }) => ({
      results: rows.map((row) => ({ requestId: row.requestId, distanceMeters: row.requestId === "SOS-A" ? 1200 : 3800 })),
    }),
    ...options,
  });
}

test("one ORS Matrix request for many SOS, meters, correct source/destination ordering", async () => {
  const s = service();
  const result = await s.impl.estimateBatch(input);
  assert.deepEqual(result.results, [
    { requestId: "SOS-A", distanceMeters: 1240 },
    { requestId: "SOS-B", distanceMeters: 3801 },
  ]);
  assert.equal(result.provider, "openrouteservice");
  assert.equal(s.calls, 1);
  const { url, init } = s.requests[0];
  assert.equal(url, "https://api.heigit.org/openrouteservice/v2/matrix/driving-car");
  assert.equal(init.headers.Authorization, "fake-test-key");
  assert.deepEqual(JSON.parse(init.body), {
    locations: [[108.2022, 16.0544], [108.21, 16.06], [108.22, 16.07]],
    sources: ["0"], destinations: ["1", "2"], metrics: ["distance"], units: "m", resolve_locations: false,
  });
});

test("unreachable roads remain null, never straight-line distance", async () => {
  const s = service({ fetchImplementation: async () => ({ ok: true, json: async () => ({ distances: [[null, 2500]] }) }) });
  assert.deepEqual((await s.impl.estimateBatch(input)).results, [
    { requestId: "SOS-A", distanceMeters: null }, { requestId: "SOS-B", distanceMeters: 2500 },
  ]);
});

test("cache and in-flight de-dup prevent repeated Matrix requests", async () => {
  const s = service();
  await Promise.all([s.impl.estimateBatch(input), s.impl.estimateBatch(input)]);
  await s.impl.estimateBatch(input);
  assert.equal(s.calls, 1);
});

test("small destination updates recompute the Matrix distances", async () => {
  const s = service();
  const moved = { ...p1, latitude: p1.latitude + 0.00001 };
  assert.equal(moved.latitude.toFixed(4), p1.latitude.toFixed(4));
  await s.impl.estimateBatch(input);
  await s.impl.estimateBatch({
    ...input,
    destinations: [{ ...destinations[0], destination: moved }, destinations[1]],
  });
  assert.equal(s.calls, 2);
});

test("cache expires after two minutes", async () => {
  let clock = Date.now();
  const s = service({ now: () => clock });
  await s.impl.estimateBatch(input);
  clock += 120_001;
  await s.impl.estimateBatch(input);
  assert.equal(s.calls, 2);
});

test("invalid, duplicate IDs or points rejected before calling provider", async () => {
  const s = service();
  for (const bad of [
    { ...input, destinations: [destinations[0], destinations[0]] },
    { ...input, origin: { latitude: 99, longitude: 0 } },
    { ...input, destinations: Array.from({ length: 101 }, (_, i) => ({ requestId: `x${i}`, destination: p1 })) },
  ]) await assert.rejects(s.impl.estimateBatch(bad), (e) => e.statusCode === 400);
  assert.equal(s.calls, 0);
});

test("empty valid SOS locations avoid ORS provider call", async () => {
  const s = service({ apiKeyProvider: () => undefined });
  const response = await s.impl.estimateBatch({ ...input, destinations: [] });
  assert.deepEqual(response.results, []);
  assert.equal(s.calls, 0);
});

test("missing key fails closed", async () => {
  const s = service({ apiKeyProvider: () => undefined });
  await assert.rejects(s.impl.estimateBatch(input), (e) => e.code === "ROUTES_NOT_CONFIGURED" && e.statusCode === 503);
});

test("provider quotas fail without fabricated distance", async () => {
  for (const status of [403, 429]) {
    const s = service({ fetchImplementation: async () => ({ ok: false, status }) });
    await assert.rejects(s.impl.estimateBatch(input), (e) => e.code === "ROUTES_PROVIDER_LIMITED");
  }
});

test("malformed matrix shape and negative values fail safely", async () => {
  for (const result of [{ distances: [] }, { distances: [[42]] }, { distances: [[-1, 123]] },
    { distances: [["1", 42]] }, { distances: [[null, Infinity]] }]) {
    const s = service({ fetchImplementation: async () => ({ ok: true, json: async () => result }) });
    await assert.rejects(s.impl.estimateBatch(input), (e) => e.code === "ROUTES_BAD_RESPONSE");
  }
});

test("provider network failures handled safely", async () => {
  const s = service({ fetchImplementation: async () => { throw new Error("network"); } });
  await assert.rejects(s.impl.estimateBatch(input), (e) => e.statusCode === 502);
});

test("user and process quotas cap Matrix requests independently of Directions", async () => {
  const s = service({ userMinuteLimit: 1, processMinuteLimit: 1 });
  await s.impl.estimateBatch(input);
  await assert.rejects(s.impl.estimateBatch({ ...input, origin: { latitude: 16.05, longitude: 108.2 } }),
    (e) => e.code === "ROUTE_RATE_LIMITED" && e.statusCode === 429);
  assert.equal(s.calls, 1);
});

test("controller requires authentication and an active Rescue role", async () => {
  const c = controller();
  const r1 = res(); await c({ body: { origin, requestIds: ["SOS-A"] } }, r1);
  assert.equal(r1.code, 401);
  const noRole = controller({ findUser: async () => ({ role: "resident", isActive: true }) });
  const r2 = res(); await noRole({ user: { id: "u" }, body: { origin, requestIds: ["SOS-A"] } }, r2);
  assert.equal(r2.code, 403);
});

test("controller resolves coordinates server-side and preserves original SOS order", async () => {
  let passed;
  const c = controller({ estimateBatch: async (args) => {
    passed = args;
    return { results: [{ requestId: "SOS-B", distanceMeters: 750 }, { requestId: "SOS-A", distanceMeters: 200 }] };
  } });
  const r = res();
  await c({ user: { id: "Rescue1" }, body: { origin, requestIds: ["SOS-A", "SOS-B"] } }, r);
  assert.equal(r.code, 200);
  assert.deepEqual(passed.destinations, destinations);
  assert.equal(passed.rescueId, "Rescue1");
  assert.deepEqual(r.body.data.results, [
    { requestId: "SOS-A", distanceMeters: 200, destination: p1 },
    { requestId: "SOS-B", distanceMeters: 750, destination: p2 },
  ]);
});

test("missing/unlocated SOS yields null while still returning reachable SOS", async () => {
  const c = controller({ findRequest: async (id) => id === "SOS-A" ? { location: p1 } : null });
  const r = res();
  await c({ user: { id: "u" }, body: { origin, requestIds: ["SOS-A", "SOS-B"] } }, r);
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.data.results, [
    { requestId: "SOS-A", distanceMeters: 1200, destination: p1 },
    { requestId: "SOS-B", distanceMeters: null, destination: null },
  ]);
});

test("controller rejects injected coordinates, duplicate IDs, invalid coordinates", async () => {
  const c = controller();
  for (const body of [
    { origin, requestIds: ["SOS-A"], destinations: [{ latitude: 1, longitude: 2 }] },
    { origin, requestIds: ["SOS-A", "SOS-A"] },
    { origin, requestIds: [] },
    { origin: { latitude: 99, longitude: 1 }, requestIds: ["SOS-A"] },
  ]) {
    const r = res();
    await c({ user: { id: "u" }, body }, r);
    assert.equal(r.code, 400);
  }
});

// The list must not be allowed to associate a result with a position supplied by
// the caller. The authoritative coordinate must come from the stored SOS document.
test("Matrix response binds each distance to server-resolved SOS coordinates", async () => {
  const newPosition = { latitude: 16.08, longitude: 108.23 };
  const c = controller({ findRequest: async (id) => ({ location: id === "SOS-A" ? newPosition : p2 }) });
  const r = res();
  await c({ user: { id: "rescue-1" }, body: { origin, requestIds: ["SOS-A", "SOS-B"] } }, r);
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.data.results[0], {
    requestId: "SOS-A", distanceMeters: 1200, destination: newPosition,
  });
});
