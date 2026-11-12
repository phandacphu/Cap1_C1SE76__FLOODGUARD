"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRescueRouteDistanceService } = require("../src/services/rescue-route-distance.service");
const { createRescueRouteDistanceController } = require("../src/controllers/rescue-route-distance.controller");

const origin = { latitude: 15.889547, longitude: 108.260348 };
const destination = { latitude: 15.899547, longitude: 108.270348 };
const args = { origin, destination, requestId: "TEST_SOS", rescueId: "TEST_RESCUER" };
function createService(options = {}) {
  let calls = 0;
  const requests = [];
  const service = createRescueRouteDistanceService({
    apiKeyProvider: () => "test-key-not-real",
    fetchImplementation: async (url, init) => {
      calls++;
      requests.push({ url, init });
      return { ok: true, json: async () => ({ routes: [{ summary: { distance: 4812.4 } }] }) };
    },
    ...options,
  });
  return { service, requests, get calls() { return calls; } };
}

function responseRecorder() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; } };
}
const rescueUser = { role: "rescue", isActive: true };
function makeController(overrides = {}) {
  return createRescueRouteDistanceController({
    findUser: async () => rescueUser,
    findRequest: async () => ({ location: destination }),
    estimate: async () => ({ distanceMeters: 4812, distanceKm: 4.8, travelMode: "DRIVE", provider: "openrouteservice" }),
    ...overrides,
  });
}

test("ORS uses the new HeiGIT endpoint, [longitude, latitude], and requests meters only", async () => {
  const r = createService();
  const result = await r.service.estimate(args);
  assert.equal(result.distanceMeters, 4812);
  assert.equal(result.distanceKm, 4.8);
  assert.equal(result.provider, "openrouteservice");
  assert.equal(result.travelMode, "DRIVE");
  assert.equal(r.calls, 1);
  const { url, init } = r.requests[0];
  assert.equal(url, "https://api.heigit.org/openrouteservice/v2/directions/driving-car/json");
  assert.equal(init.headers.Authorization, "test-key-not-real");
  assert.equal(init.method, "POST");
  const body = JSON.parse(init.body);
  assert.deepEqual(body.coordinates, [[origin.longitude, origin.latitude], [destination.longitude, destination.latitude]]);
  assert.equal(body.geometry, false);
  assert.equal(body.instructions, false);
  assert.equal(body.units, "m");
});

test("successes are cached and parallel duplicate requests are coalesced", async () => {
  const r = createService();
  const [a, b] = await Promise.all([r.service.estimate(args), r.service.estimate(args)]);
  assert.deepEqual(a, b);
  await r.service.estimate(args);
  assert.equal(r.calls, 1);
});

test("small destination updates recompute the road distance", async () => {
  const r = createService();
  const moved = { ...destination, latitude: destination.latitude - 0.00001 };
  assert.equal(moved.latitude.toFixed(4), destination.latitude.toFixed(4));
  await r.service.estimate(args);
  await r.service.estimate({ ...args, destination: moved });
  assert.equal(r.calls, 2);
});

test("cache expires after two minutes", async () => {
  let time = Date.now();
  const r = createService({ now: () => time });
  await r.service.estimate(args);
  time += 120_001;
  await r.service.estimate(args);
  assert.equal(r.calls, 2);
});

test("missing ORS provider key fails closed", async () => {
  const r = createService({ apiKeyProvider: () => undefined });
  await assert.rejects(r.service.estimate(args), (e) => e.statusCode === 503 && e.code === "ROUTES_NOT_CONFIGURED");
  assert.equal(r.calls, 0);
});

test("invalid coordinates are rejected before provider call", async () => {
  const r = createService();
  await assert.rejects(r.service.estimate({ ...args, origin: { latitude: 91, longitude: 0 } }),
    (e) => e.statusCode === 400);
  assert.equal(r.calls, 0);
});

test("empty ORS routes are not substituted with straight-line distance", async () => {
  const r = createService({ fetchImplementation: async () => ({ ok: true, json: async () => ({ routes: [] }) }) });
  await assert.rejects(r.service.estimate(args), (e) => e.statusCode === 404 && e.code === "ROUTE_NOT_FOUND");
});

test("ORS 2009 no-route error maps to 404 rather than fake distance", async () => {
  const r = createService({ fetchImplementation: async () => ({ ok: false, status: 404,
    json: async () => ({ error: { code: 2009 } }) }) });
  await assert.rejects(r.service.estimate(args), (e) => e.statusCode === 404 && e.code === "ROUTE_NOT_FOUND");
});

test("ORS 2010 unsnappable road point maps to 422", async () => {
  const r = createService({ fetchImplementation: async () => ({ ok: false, status: 400,
    json: async () => ({ error: { code: 2010 } }) }) });
  await assert.rejects(r.service.estimate(args), (e) => e.statusCode === 422 && e.code === "ROUTE_POINT_UNREACHABLE");
});

test("wrong endpoint 404 without ORS route code is treated as provider error", async () => {
  const r = createService({ fetchImplementation: async () => ({ ok: false, status: 404,
    json: async () => ({ error: "Not Found" }) }) });
  await assert.rejects(r.service.estimate(args), (e) => e.statusCode === 502 && e.code === "ROUTES_PROVIDER_ERROR");
});

test("provider 429 is distinguishable from invalid route and fails safely", async () => {
  const r = createService({ fetchImplementation: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(r.service.estimate(args), (e) => e.statusCode === 503 && e.code === "ROUTES_PROVIDER_LIMITED");
});

test("ORS error does not fake a distance", async () => {
  const r = createService({ fetchImplementation: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(r.service.estimate(args), (e) => e.statusCode === 502 && e.code === "ROUTES_PROVIDER_ERROR");
});

test("invalid or missing ORS distance does not return a fabricated result", async () => {
  for (const invalid of [undefined, -2, "4812", Infinity]) {
    const r = createService({ fetchImplementation: async () => ({ ok: true, json: async () => ({
      routes: [{ summary: { distance: invalid } }],
    }) }) });
    await assert.rejects(r.service.estimate(args), (e) => e.statusCode === 502 && e.code === "ROUTES_BAD_RESPONSE");
  }
});

test("per-user rate limit protects ORS quota", async () => {
  const r = createService();
  for (let i = 0; i < 10; i++) await r.service.estimate({ ...args, requestId: `TEST_${i}` });
  await assert.rejects(r.service.estimate({ ...args, requestId: "TEST_over" }),
    (e) => e.statusCode === 429 && e.code === "ROUTE_RATE_LIMITED");
  assert.equal(r.calls, 10);
});

test("process-wide minute and UTC-day limits protect the free quota", async () => {
  const r = createService({ processMinuteLimit: 2, processDayLimit: 2 });
  await r.service.estimate({ ...args, requestId: "A", rescueId: "u1" });
  await r.service.estimate({ ...args, requestId: "B", rescueId: "u2" });
  await assert.rejects(r.service.estimate({ ...args, requestId: "C", rescueId: "u3" }),
    (e) => e.statusCode === 429 && e.code === "ROUTE_RATE_LIMITED");
  assert.equal(r.calls, 2);
});

test("controller checks authentication, DB role and active account", async () => {
  const ctrl = makeController();
  const res1 = responseRecorder();
  await ctrl({ body: { requestId: "TEST_SOS", origin } }, res1);
  assert.equal(res1.statusCode, 401);
  const ctrl2 = makeController({ findUser: async () => ({ role: "resident", isActive: true }) });
  const res2 = responseRecorder();
  await ctrl2({ user: { id: "TEST_RESCUER" }, body: { requestId: "TEST_SOS", origin } }, res2);
  assert.equal(res2.statusCode, 403);
});

test("controller derives destination from stored SOS, not the caller's payload", async () => {
  let captured;
  const ctrl = makeController({ estimate: async (v) => {
    captured = v;
    return { distanceMeters: 4812, distanceKm: 4.8, travelMode: "DRIVE", provider: "openrouteservice" };
  } });
  const res = responseRecorder();
  await ctrl({ user: { id: "TEST_RESCUER" }, body: { requestId: "TEST_SOS", origin } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(captured.destination, destination);
  assert.deepEqual(res.body.data.destination, destination);
  assert.equal(res.body.data.distanceKm, 4.8);
});

test("controller rejects extra fields and invalid request IDs", async () => {
  const ctrl = makeController();
  for (const body of [
    { requestId: "TEST_SOS", origin, destination },
    { requestId: "../hidden", origin },
    { requestId: "TEST_SOS", origin: { latitude: NaN, longitude: 1 } },
  ]) {
    const res = responseRecorder();
    await ctrl({ user: { id: "TEST_RESCUER" }, body }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("controller reports unavailable SOS location without calling ORS", async () => {
  const ctrl = makeController({ findRequest: async () => ({ location: null }), estimate: async () => { throw new Error("Should not call"); } });
  const res = responseRecorder();
  await ctrl({ user: { id: "TEST_RESCUER" }, body: { requestId: "TEST_SOS", origin } }, res);
  assert.equal(res.statusCode, 422);
});
