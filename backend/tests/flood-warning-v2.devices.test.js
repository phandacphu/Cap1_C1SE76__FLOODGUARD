const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { createTestDb } = require("./helpers/warning-v2-test-db");
const { createWarningDeviceService, DEVICE_COLLECTIONS: C } = require("../src/services/warning-v2-device.service");
const { createWarningZonesService } = require("../src/services/warning-v2-zones.service");
const h = require("./helpers/warning-v2-geography");
function setup() {
  const env = createTestDb(); let now = Date.now();
  env.put("users/resident2", { role: "resident", isActive: true });
  env.put("flood_alerts/TEST-ONLY", { schemaVersion: 2, status: "active" });
  const zonesService = createWarningZonesService({ db: env.db, loadLayer: h.layerLoader({ radar: h.collection([h.feature(h.square())]) }) });
  const svc = createWarningDeviceService({ db: env.db, zonesService, clock: () => now });
  const id = randomUUID(), secret = randomBytes(32).toString("base64url");
  const body = (overrides = {}) => ({ platform: "android", notificationPermission: "denied", fcmToken: null,
    registrationId: randomUUID(), expectedBindingId: null, expectedRevision: 0, ...overrides });
  const headers = (device) => ({ installationId: id, bindingId: device.bindingId, secret });
  const sample = (sequence = 1, overrides = {}) => ({ sequence, availability: "available", reason: null,
    location: { latitude: 0, longitude: 0 }, capturedAt: new Date(now).toISOString(), accuracyM: 20, ...overrides });
  return { ...env, svc, zonesService, id, secret, body, headers, sample, now: () => now, advance: (ms) => { now += ms; } };
}
test("device first registration requires proof, retry is stable, output contains no token/secret/owner", async () => {
  const e = setup(), data = e.body({ fcmToken: "TEST_ONLY_token", notificationPermission: "granted" });
  assert.equal((await e.svc.installation("resident", e.id, e.secret)).installation.revision, 0);
  const first = (await e.svc.register("resident", e.id, e.secret, data)).device;
  const retry = (await e.svc.register("resident", e.id, e.secret, data)).device;
  assert.deepEqual(first, retry); assert.equal(first.revision, 1); assert.equal(first.pushEligible, true);
  const result = JSON.stringify(first); for (const value of [e.secret, data.fcmToken, "ownerId", "secretHash"]) assert.ok(!result.includes(value));
  assert.equal(e.count(C.registrations), 1); assert.equal(e.count(C.tokens), 1);
  assert.equal(e.records.get(`${C.devices}/${e.id}`).secretHash.includes(e.secret), false);
});
test("registration races: concurrent retry stable; competing login CAS admits one", async () => {
  const e = setup(), data = e.body();
  const results = await Promise.all(Array.from({ length: 6 }, () => e.svc.register("resident", e.id, e.secret, data)));
  assert.equal(new Set(results.map((r) => r.device.bindingId)).size, 1);
  const first = results[0].device;
  const competing = await Promise.allSettled(["resident", "resident2"].map((actor) => e.svc.register(actor, e.id, e.secret,
    e.body({ expectedBindingId: first.bindingId, expectedRevision: first.revision }))));
  assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(competing.find((r) => r.status === "rejected").reason.code, "DEVICE_BINDING_CHANGED");
});
test("unknown secret and stale account cannot take ownership, unregister, upload or read GPS", async () => {
  const e = setup(), device = (await e.svc.register("resident", e.id, e.secret, e.body())).device;
  const wrong = randomBytes(32).toString("base64url"), headers = { ...e.headers(device), secret: wrong };
  for (const action of [() => e.svc.installation("resident2", e.id, wrong),
    () => e.svc.register("resident2", e.id, wrong, e.body()), () => e.svc.upload("resident", headers, e.sample()),
    () => e.svc.evaluation("resident", headers), () => e.svc.unregister("resident", e.id, headers)]) {
    await assert.rejects(action(), { code: "INSTALLATION_PROOF_INVALID" });
  }
  await assert.rejects(e.svc.evaluation("resident2", e.headers(device)), { code: "DEVICE_BINDING_CHANGED" });
  assert.equal(e.count(C.events), 0);
});
test("token refresh preserves binding and GPS sequence; stale revision cannot revert permission/token", async () => {
  const e = setup(), data = e.body(), d = (await e.svc.register("resident", e.id, e.secret, data)).device;
  await e.svc.upload("resident", e.headers(d), e.sample());
  const update = { ...data, expectedBindingId: d.bindingId, expectedRevision: d.revision,
    fcmToken: "TEST_ONLY_refresh", notificationPermission: "granted" };
  const d2 = (await e.svc.register("resident", e.id, e.secret, update)).device;
  assert.equal(d2.bindingId, d.bindingId); assert.equal(d2.revision, 2); assert.equal(d2.pushEligible, true);
  assert.equal((await e.svc.evaluation("resident", e.headers(d2))).evaluation.sequence, 1);
  assert.equal((await e.svc.register("resident", e.id, e.secret, update)).device.revision, 2);
  assert.equal((await e.svc.register("resident", e.id, e.secret, { ...update, expectedRevision: 2 })).device.revision, 2);
  await assert.rejects(e.svc.register("resident", e.id, e.secret, data), { code: "DEVICE_BINDING_CHANGED" });
});
test("logout removes private sample/token and repeat safe; old registration and old logout cannot replace new account", async () => {
  const e = setup(), data = e.body({ fcmToken: "TEST_ONLY_token" }), d = (await e.svc.register("resident", e.id, e.secret, data)).device;
  await e.svc.upload("resident", e.headers(d), e.sample());
  assert.equal((await e.svc.unregister("resident", e.id, e.headers(d))).unbound, true);
  assert.equal((await e.svc.unregister("resident", e.id, e.headers(d))).unbound, true);
  assert.equal(e.records.get(`${C.devices}/${e.id}`).fcmToken, null);
  assert.equal(e.records.get(`${C.locations}/${e.id}`).location, null);
  await assert.rejects(e.svc.register("resident", e.id, e.secret, data), { code: "DEVICE_BINDING_CHANGED" });
  const state = (await e.svc.installation("resident2", e.id, e.secret)).installation;
  const next = (await e.svc.register("resident2", e.id, e.secret, e.body({ expectedBindingId: state.bindingId, expectedRevision: state.revision }))).device;
  assert.notEqual(next.bindingId, d.bindingId);
  for (const action of [() => e.svc.unregister("resident", e.id, e.headers(d)),
    () => e.svc.upload("resident", e.headers(d), e.sample(2)), () => e.svc.evaluation("resident", e.headers(d))]) {
    await assert.rejects(action(), { code: "DEVICE_BINDING_CHANGED" });
  }
  const empty = (await e.svc.evaluation("resident2", e.headers(next))).evaluation;
  assert.equal(empty.reason, "no_location"); assert.equal(empty.location, null); assert.equal(empty.sequence, null);
});
test("same physical token cannot be stolen by another installation; released claim can bind safely", async () => {
  const e = setup(), data = e.body({ fcmToken: "TEST_ONLY_shared" }), d = (await e.svc.register("resident", e.id, e.secret, data)).device;
  const otherId = randomUUID(), otherSecret = randomBytes(32).toString("base64url"), otherBody = e.body({ fcmToken: data.fcmToken });
  await assert.rejects(e.svc.register("resident2", otherId, otherSecret, otherBody), { code: "DEVICE_TOKEN_CONFLICT" });
  assert.equal(e.records.has(`${C.devices}/${otherId}`), false);
  await e.svc.unregister("resident", e.id, e.headers(d));
  assert.ok((await e.svc.register("resident2", otherId, otherSecret, otherBody)).device.bindingId);
});
test("validation rejects malformed device/proof without mutating storage", async () => {
  const e = setup();
  for (const data of [null, {}, e.body({ platform: "ios" }), e.body({ fcmToken: "\nsecret" }), e.body({ notificationPermission: "yes" }),
    e.body({ expectedRevision: -1 }), e.body({ expectedBindingId: "other" }), { ...e.body(), ownerId: "resident2" }]) {
    await assert.rejects(e.svc.register("resident", e.id, e.secret, data), { code: "INVALID_DEVICE_DATA" });
  }
  await assert.rejects(e.svc.register("resident", e.id, "weak", e.body()), { code: "INVALID_DEVICE_DATA" });
  assert.equal(e.count(C.devices), 0);
});
test("GPS upload retry atomic, same sequence conflict and lower sequence cannot overwrite", async () => {
  const e = setup(), d = (await e.svc.register("resident", e.id, e.secret, e.body())).device, headers = e.headers(d), body = e.sample(3);
  const first = (await e.svc.upload("resident", headers, body)).evaluation;
  assert.equal(first.status, "inside"); assert.equal(first.sequence, 3); assert.ok(first.receivedAt);
  const again = (await e.svc.upload("resident", headers, body)).evaluation;
  assert.equal(again.receivedAt, first.receivedAt); assert.equal(e.count(C.events), 1);
  for (const sample of [e.sample(2), e.sample(3, { accuracyM: 30 })]) {
    await assert.rejects(e.svc.upload("resident", headers, sample), { code: "LOCATION_SEQUENCE_CONFLICT" });
  }
  assert.equal(e.records.get(`${C.locations}/${e.id}`).sequence, 3);
});
test("concurrent GPS increments preserve maximum sequence; one event for identical retries", async () => {
  const e = setup(), d = (await e.svc.register("resident", e.id, e.secret, e.body())).device, headers = e.headers(d), sample = e.sample();
  await Promise.all(Array.from({ length: 5 }, () => e.svc.upload("resident", headers, sample)));
  assert.equal(e.count(C.events), 1);
  const results = await Promise.allSettled([2, 4, 3].map((n) => e.svc.upload("resident", headers, e.sample(n))));
  assert.equal(e.records.get(`${C.locations}/${e.id}`).sequence, 4);
  for (const r of results.filter((r) => r.status === "rejected")) assert.equal(r.reason.code, "LOCATION_SEQUENCE_CONFLICT");
});
test("GET evaluation expires GPS and reflects deactivation/zone changes without emitting events", async () => {
  const e = setup(), d = (await e.svc.register("resident", e.id, e.secret, e.body())).device, headers = e.headers(d);
  const initial = (await e.svc.upload("resident", headers, e.sample())).evaluation;
  e.put("flood_areas/TEST_ONLY_NEW_REGION", { areaType: "low_lying", geometry: h.adminGeometry() });
  const updated = (await e.svc.evaluation("resident", headers)).evaluation;
  assert.notEqual(updated.zonesRevision, initial.zonesRevision);
  assert.ok(updated.matches.some((m) => m.zoneId === "admin:TEST_ONLY_NEW_REGION"));
  const count = e.count(C.events); e.advance(60000);
  assert.equal((await e.svc.evaluation("resident", headers)).evaluation.status, "inside"); e.advance(1);
  assert.equal((await e.svc.evaluation("resident", headers)).evaluation.reason, "stale_location");
  e.put("flood_alerts/TEST-ONLY", { schemaVersion: 2, status: "inactive" });
  assert.equal((await e.svc.evaluation("resident", headers)).evaluation.reason, "no_active_alert");
  assert.equal(e.count(C.events), count);
});
test("unavailable and poor GPS invalidate prior match; malformed new body leaves prior sample intact", async () => {
  const e = setup(), d = (await e.svc.register("resident", e.id, e.secret, e.body())).device, headers = e.headers(d);
  await e.svc.upload("resident", headers, e.sample());
  await assert.rejects(e.svc.upload("resident", headers, e.sample(2, { capturedAt: "invalid" })), { code: "INVALID_LOCATION_DATA" });
  assert.equal((await e.svc.evaluation("resident", headers)).evaluation.sequence, 1);
  const poor = await e.svc.upload("resident", headers, e.sample(2, { accuracyM: 101 }));
  assert.equal(poor.evaluation.reason, "poor_accuracy");
  const unavailable = await e.svc.upload("resident", headers, e.sample(3, { availability: "unavailable", reason: "permission_denied",
    location: null, capturedAt: null, accuracyM: null }));
  assert.equal(unavailable.evaluation.reason, "permission_denied"); assert.equal(unavailable.evaluation.location, null);
});
test("late GPS response rereads latest sample and rejects a binding switched while loading zones", async () => {
  const e = setup(), data = e.body(), d = (await e.svc.register("resident", e.id, e.secret, data)).device, headers = e.headers(d);
  const load = e.zonesService.load;
  let once = true;
  e.zonesService.load = async () => {
    if (once) { once = false; await e.svc.upload("resident", headers, e.sample(2)); }
    return load();
  };
  assert.equal((await e.svc.upload("resident", headers, e.sample(1))).evaluation.sequence, 2);
  once = true;
  e.zonesService.load = async () => {
    if (once) { once = false; await e.svc.register("resident2", e.id, e.secret,
      e.body({ expectedBindingId: d.bindingId, expectedRevision: d.revision })); }
    return load();
  };
  await assert.rejects(e.svc.evaluation("resident", headers), { code: "DEVICE_BINDING_CHANGED" });
});
test("authorization rechecked transactionally; commit failure leaves no registration or GPS event", async () => {
  const e = setup();
  for (const actor of ["admin", "rescue", "inactive", "missing"]) {
    await assert.rejects(e.svc.register(actor, e.id, e.secret, e.body()), (err) => ["ROLE_FORBIDDEN", "ACCOUNT_INACTIVE", "AUTH_REQUIRED"].includes(err.code));
  }
  e.failCommits(); await assert.rejects(e.svc.register("resident", e.id, e.secret, e.body()));
  assert.equal(e.count(C.devices), 0); e.failCommits(false);
  const d = (await e.svc.register("resident", e.id, e.secret, e.body())).device;
  e.beforeCommit(() => e.put("users/resident", { role: "resident", isActive: false }));
  await assert.rejects(e.svc.upload("resident", e.headers(d), e.sample()), { code: "ACCOUNT_INACTIVE" });
  assert.equal(e.count(C.events), 0);
});
