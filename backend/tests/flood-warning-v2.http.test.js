const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { createTestDb } = require("./helpers/warning-v2-test-db");
const env = createTestDb();
const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db: env.db } };
process.env.JWT_SECRET = "warning-v2-isolated-http-tests-only";
// Exercise the real production app and route mounts, not a second endpoint implementation.
const app = require("../src/app");
const admin = "/api/admin/flood-alerts", read = "/api/flood-alerts";
const body = { title: "TEST ONLY - Mưa lớn", content: "Dữ liệu kiểm thử" };
beforeEach(() => env.reset());
async function withApi(callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function api(path, { actor = "admin", role, method = "GET", body, rawBody, headers = {}, token } = {}) {
    const auth = actor === null ? {} : { Authorization: `Bearer ${token || jwt.sign({ sub: actor,
      role: role || env.records.get(`users/${actor}`)?.role || "admin" }, process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "5m" })}` };
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...auth, ...headers },
      body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  try { await callback(api); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
async function create(api, key = randomUUID()) {
  const r = await api(admin, { method: "POST", body, headers: { "Idempotency-Key": key } });
  assert.equal(r.status, 201); return r.body.data.floodAlert;
}
test("HTTP real app: create, read all roles, edit, summary, deactivate, history and replay", () => withApi(async (api) => {
  const key = randomUUID();
  const first = await api(admin, { method: "POST", body, headers: { "Idempotency-Key": key } });
  assert.equal(first.status, 201); const a = first.body.data.floodAlert;
  assert.equal(a.endAt, null);
  for (const actor of ["resident", "rescue", "admin"]) {
    const detail = await api(`${read}/${a.id}`, { actor }); assert.equal(detail.status, 200);
    assert.equal(detail.body.data.floodAlert.id, a.id);
  }
  assert.equal((await api(`${admin}/creation-requests/${key}`)).body.data.floodAlert.id, a.id);
  const patch = await api(`${admin}/${a.id}`, { method: "PATCH", body: { expectedRevision: 1, title: "Updated" } });
  assert.equal(patch.status, 200); assert.equal(patch.body.data.floodAlert.startAt, a.startAt);
  const off = await api(`${admin}/${a.id}/deactivate`, { method: "POST", body: {} });
  assert.equal(off.status, 200); assert.equal(off.body.data.changed, true);
  const again = await api(`${admin}/${a.id}/deactivate`, { method: "POST" });
  assert.equal(again.body.data.changed, false); assert.equal(again.body.data.floodAlert.endAt, off.body.data.floodAlert.endAt);
  const replay = await api(admin, { method: "POST", body, headers: { "Idempotency-Key": key } });
  assert.equal(replay.status, 200); assert.equal(replay.body.data.floodAlert.status, "inactive");
  assert.equal((await api(`${read}/active`, { actor: "rescue" })).body.data.floodAlerts.length, 0);
  assert.equal((await api(`${read}?status=inactive`, { actor: "resident" })).body.data.floodAlerts[0].id, a.id);
  const summary = (await api(`${admin}/summary`)).body.data;
  assert.deepEqual([summary.total, summary.active, summary.inactive], [1, 0, 1]);
}));
test("HTTP missing/invalid tokens and current database role enforcement", () => withApi(async (api) => {
  for (const path of [read, admin]) {
    const r = await api(path, { actor: null }); assert.equal(r.status, 401); assert.equal(r.body.code, "AUTH_REQUIRED");
  }
  assert.equal((await api(read, { token: "invalid" })).status, 401);
  for (const options of [{ algorithm: "HS256", expiresIn: -1 }, { algorithm: "HS384", expiresIn: "5m" }]) {
    const token = jwt.sign({ sub: "admin", role: "admin" }, process.env.JWT_SECRET, options);
    assert.equal((await api(read, { token })).status, 401);
  }
  for (const actor of ["resident", "rescue"]) {
    const r = await api(admin, { actor, role: "admin", method: "POST", body, headers: { "Idempotency-Key": randomUUID() } });
    assert.equal(r.status, 403); assert.equal(r.body.code, "ROLE_FORBIDDEN");
  }
  assert.equal((await api(admin, { actor: "inactive" })).body.code, "ACCOUNT_INACTIVE");
  assert.equal((await api(read, { actor: "missing" })).status, 401);
  // A formerly-Rescue JWT cannot block a current Admin; DB role is authoritative.
  assert.equal((await api(admin, { actor: "admin", role: "rescue" })).status, 200);
}));
test("HTTP body/query errors, stale revision, disabled edits, and unsupported operations", () => withApi(async (api) => {
  const a = await create(api);
  for (const query of ["severity=high", "areaId=one", "status=expired", "status=active&status=inactive", "q=a&q=b"]) {
    const r = await api(`${read}?${query}`); assert.equal(r.status, 400); assert.equal(r.body.code, "INVALID_ALERT_QUERY");
  }
  assert.equal((await api(`${read}/active?status=inactive`)).status, 400);
  assert.equal((await api(`${admin}/summary?status=active`)).status, 400);
  for (const extra of [{ status: "inactive" }, { severity: "high" }, { areaId: "one" }, { endAt: null }]) {
    assert.equal((await api(admin, { method: "POST", body: { ...body, ...extra }, headers: { "Idempotency-Key": randomUUID() } })).status, 400);
  }
  assert.equal((await api(admin, { method: "POST", body })).body.code, "INVALID_ALERT_DATA");
  assert.equal((await api(`${admin}/${a.id}`, { method: "PATCH", body: { expectedRevision: 9, title: "Other" } })).body.code, "ALERT_REVISION_CONFLICT");
  await api(`${admin}/${a.id}/deactivate`, { method: "POST" });
  assert.equal((await api(`${admin}/${a.id}`, { method: "PATCH", body: { expectedRevision: 2, title: "Other" } })).body.code, "ALERT_ALREADY_INACTIVE");
  assert.equal((await api(`${admin}/${a.id}`, { method: "DELETE" })).status, 404);
  assert.equal((await api(`${admin}/${a.id}/activate`, { method: "POST" })).status, 404);
  assert.equal(env.count("flood_alerts"), 1);
}));
test("HTTP concurrent same-key creates use one stored alert and return a single 201", () => withApi(async (api) => {
  const key = randomUUID(); const results = await Promise.all(Array.from({ length: 6 }, () => api(admin,
    { method: "POST", body, headers: { "Idempotency-Key": key } })));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 200).length, 5);
  assert.equal(new Set(results.map((r) => r.body.data.floodAlert.id)).size, 1);
}));
test("HTTP V1 records excluded, empty/error distinguished, no raw DB errors leak", () => withApi(async (api) => {
  env.put("flood_alerts/legacy", { title: "Legacy", status: "active", severity: "critical" });
  assert.deepEqual((await api(read)).body.data.floodAlerts, []);
  assert.equal((await api(`${read}/legacy`)).body.code, "ALERT_NOT_FOUND");
  assert.equal((await api(`${admin}/creation-requests/${randomUUID()}`)).body.code, "CREATION_REQUEST_NOT_FOUND");
  env.failReads(); const failure = await api(read);
  assert.equal(failure.status, 500); assert.equal(failure.body.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(failure.body).includes("SIMULATED"), false);
}));
test("HTTP malformed JSON is structured; private GPS paths enforce proof and Resident permission", () => withApi(async (api) => {
  const invalid = await api(admin, { method: "POST", rawBody: "{" });
  assert.equal(invalid.status, 400); assert.equal(invalid.body.code, "INVALID_ALERT_DATA");
  for (const path of ["/location-evaluation"]) {
    const r = await api(read + path, { actor: "resident" });
    assert.equal(r.status, 400); assert.equal(r.body.code, "INVALID_DEVICE_DATA");
  }
  assert.equal((await api(read + "/location", { method: "PUT", actor: "rescue", body: {} })).status, 403);
}));
test("HTTP actual mounts bind, upload/read GPS, clear unavailable, logout, block old session", () => withApi(async (api) => {
  await create(api);
  const id = randomUUID(), secret = randomBytes(32).toString("base64url"), path = `/api/notification-devices/${id}`;
  const headers = { "X-Installation-Secret": secret };
  const body = { platform: "android", fcmToken: "TEST_ONLY_HTTP_TOKEN", notificationPermission: "denied", registrationId: randomUUID(), expectedBindingId: null, expectedRevision: 0 };
  assert.equal((await api(path, { actor: null, headers })).status, 401);
  for (const actor of ["admin", "rescue"]) assert.equal((await api(path, { actor, method: "PUT", body, headers })).status, 403);
  const state = await api(path, { actor: "resident", headers }); assert.equal(state.body.data.installation.revision, 0);
  const registered = await api(path, { actor: "resident", method: "PUT", body, headers }); assert.equal(registered.status, 200);
  assert.ok(!JSON.stringify(registered.body).includes(body.fcmToken));
  const bindingId = registered.body.data.device.bindingId;
  const bound = { ...headers, "X-Installation-Id": id, "X-Device-Binding-Id": bindingId };
  const noGps = await api(read + "/location-evaluation", { actor: "resident", headers: bound });
  assert.equal(noGps.status, 200); assert.equal(noGps.body.data.evaluation.reason, "no_location");
  const gps = { sequence: 1, availability: "available", reason: null, location: { latitude: 16.0544, longitude: 108.2022 },
    capturedAt: new Date().toISOString(), accuracyM: 20 };
  const upload = await api(read + "/location", { actor: "resident", method: "PUT", body: gps, headers: bound });
  assert.equal(upload.status, 200); assert.equal(upload.body.data.evaluation.sequence, 1);
  assert.equal(upload.body.data.evaluation.bindingId, bindingId);
  const conflict = await api(read + "/location", { actor: "resident", method: "PUT", body: { ...gps, accuracyM: 30 }, headers: bound });
  assert.equal(conflict.status, 409); assert.equal(conflict.body.code, "LOCATION_SEQUENCE_CONFLICT");
  assert.equal((await api(read + "/location-evaluation?residentId=other", { actor: "resident", headers: bound })).status, 400);
  const unavailable = { sequence: 2, availability: "unavailable", reason: "location_disabled", location: null, capturedAt: null, accuracyM: null };
  assert.equal((await api(read + "/location", { actor: "resident", method: "PUT", body: unavailable, headers: bound })).body.data.evaluation.reason, "location_disabled");
  assert.equal((await api(path, { actor: "resident", method: "DELETE", headers: bound })).status, 200);
  assert.equal((await api(path, { actor: "resident", method: "DELETE", headers: bound })).status, 200);
  assert.equal((await api(path, { actor: "resident", method: "PUT", headers, body })).status, 409);
  assert.equal((await api(read + "/location-evaluation", { actor: "resident", headers: bound })).status, 409);
  assert.equal((await api(path, { actor: "resident", method: "PUT", rawBody: "{", headers })).status, 400);
}));
test("HTTP zones route returns canonical layers with coverage, auth and no viewport filter", () => withApi(async (api) => {
  for (const actor of ["resident", "rescue", "admin"]) {
    const r = await api(read + "/zones", { actor }); assert.equal(r.status, 200);
    assert.equal(r.body.data.geojson.type, "FeatureCollection");
    assert.equal(r.body.data.coverage.status, "partial");
    const radar = r.body.data.geojson.features.filter((f) => f.properties.sourceKind === "radar");
    assert.equal(radar.length, 157); assert.ok(radar.every((f) => f.properties.group === "low_lying"));
  }
  assert.equal((await api(read + "/zones?bbox=0,0,1,1")).status, 400);
  assert.equal((await api(read + "/zones", { actor: null })).status, 401);
}));
