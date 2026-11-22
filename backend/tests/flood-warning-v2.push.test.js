const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { createTestDb } = require("./helpers/warning-v2-test-db");
const { createFloodWarningV2Service } = require("../src/services/flood-warning-v2.service");
const { createWarningDeviceService, DEVICE_COLLECTIONS: D } = require("../src/services/warning-v2-device.service");
const { createWarningV2EventWorker, WORKER_COLLECTIONS: W, deliveryId } = require("../src/services/warning-v2-event-worker.service");
const { createWarningV2PushSender, PUSH_COLLECTIONS: P, targetId } = require("../src/services/warning-v2-push-sender.service");
const { pushConfiguration, pushMessage, sendPush, classifyPushError } = require("../src/services/warning-v2-push-policy");
const { startWarningV2PushSender } = require("../src/services/warning-v2-push-scheduler.service");
const c = require("../src/services/flood-warning-v2-contract");
const h = require("./helpers/warning-v2-geography");

async function setup(options = {}) {
  const e = createTestDb(); let now = Date.now(), zones = h.zones(), broken = false;
  const zonesService = { async load() { if (broken) throw new Error("PRIVATE_REGION_FAILURE"); return zones; } };
  const api = createFloodWarningV2Service({ db: e.db, zonesService });
  const devices = createWarningDeviceService({ db: e.db, zonesService, clock: () => now });
  const worker = createWarningV2EventWorker({ db: e.db, zonesService, clock: () => now });
  const calls = []; let implementation = async () => "projects/TEST/messages/TEST";
  const factory = (extra = {}) => createWarningV2PushSender({ db: e.db, zonesService, clock: () => now, allows: () => true,
    provider: { send: async (m) => { calls.push(m); return implementation(m); } }, ...options, ...extra });
  const sender = factory();
  const alert = (await api.create("admin", randomUUID(), { title: "TEST ONLY - Cảnh báo", content: "TEST ONLY - Nội dung" })).floodAlert;
  async function binding(actor = "resident", permission = "granted", token = `TEST_TOKEN_${randomUUID()}`) {
    const installationId = randomUUID(), secret = randomBytes(32).toString("base64url"), registrationId = randomUUID();
    const device = (await devices.register(actor, installationId, secret, { platform: "android", fcmToken: token,
      notificationPermission: permission, registrationId, expectedBindingId: null, expectedRevision: 0 })).device;
    return { installationId, secret, bindingId: device.bindingId, actor, registrationId, revision: device.revision, token };
  }
  async function refresh(b, token, permission = "granted") {
    const latest = (await devices.installation(b.actor, b.installationId, b.secret)).installation;
    return devices.register(b.actor, b.installationId, b.secret, { platform: "android", fcmToken: token, notificationPermission: permission,
      registrationId: b.registrationId, expectedBindingId: latest.bindingId, expectedRevision: latest.revision });
  }
  const jobId = (kind = "general") => deliveryId("resident", alert.id, kind);
  const target = (b, kind = "general") => targetId(jobId(kind), b.installationId, b.bindingId);
  async function general() { await worker.processGeneralEvent(c.hash([alert.id, "general"])); return jobId(); }
  async function location(b, near = false, sequence = 1) {
    await devices.upload(b.actor, b, { sequence, availability: "available", reason: null, accuracyM: 20,
      capturedAt: new Date(now).toISOString(), location: near ? { latitude: 0.001, longitude: 0.025 } : { latitude: -0.025, longitude: 0.025 } });
    await worker.processDevice(b.installationId); return jobId(near ? "near" : "inside");
  }
  return { ...e, api, devices, worker, calls, sender, factory, alert, binding, refresh, general, location, jobId, target,
    state: (b, kind) => e.records.get(`${P.targets}/${target(b, kind)}`),
    provider: (fn) => { implementation = fn; }, advance: (ms) => { now += ms; },
    zones: (value) => { zones = value; }, failZones: () => { broken = true; } };
}

test("push is opt-in, test mode fail-closed, live mode does not silently keep a test filter", async () => {
  assert.deepEqual(pushConfiguration({}), { enabled: false });
  for (const env of [{}, { FLOOD_WARNING_V2_PUSH_MODE: "test" }, { FLOOD_WARNING_V2_PUSH_MODE: "live", FLOOD_WARNING_V2_TEST_RECIPIENT_IDS: "resident" }]) {
    assert.throws(() => pushConfiguration({ ...env, FLOOD_WARNING_V2_PUSH_ENABLED: "true" }));
  }
  const config = pushConfiguration({ FLOOD_WARNING_V2_PUSH_ENABLED: "true", FLOOD_WARNING_V2_PUSH_MODE: "test", FLOOD_WARNING_V2_TEST_RECIPIENT_IDS: "resident" });
  assert.equal(config.allows("resident"), true); assert.equal(config.allows("other"), false);
  assert.throws(() => pushConfiguration({ FLOOD_WARNING_V2_PUSH_ENABLED: "true", FLOOD_WARNING_V2_PUSH_MODE: "live", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8087" }));
  let initialized = 0;
  await startWarningV2PushSender({ env: {}, createSender() { initialized++; } })();
  assert.equal(initialized, 0);
});
test("general data-only push reaches all eligible bound devices without requiring GPS", async () => {
  const e = await setup(), a = await e.binding(), b = await e.binding(), denied = await e.binding("resident", "denied");
  await e.general(); await e.sender.prepareJob(e.jobId());
  await e.sender.dispatch(e.target(a)); await e.sender.dispatch(e.target(b)); await e.sender.dispatch(e.target(denied));
  assert.equal(e.calls.length, 2); assert.equal(e.state(a).status, "accepted");
  const m = e.calls[0]; assert.equal(m.notification, undefined); assert.equal(m.data.kind, "general");
  assert.equal(m.data.eventId, e.jobId()); assert.equal(m.android.ttl, 3600000);
  assert.equal(Object.values(m.data).every((v) => typeof v === "string"), true);
  assert.equal(m.data.installationId, a.installationId); assert.equal(m.data.bindingId, a.bindingId);
});
test("no eligible device keeps general discoverable, then permission/token registration catches up", async () => {
  const e = await setup(); await e.general(); await e.sender.prepareJob(e.jobId());
  assert.equal(e.count(P.targets), 0); assert.equal(e.records.get(`${W.deliveries}/${e.jobId()}`).status, "pending");
  const b = await e.binding(); await e.sender.prepareJob(e.jobId()); await e.sender.dispatch(e.target(b));
  assert.equal(e.calls.length, 1);
});
test("durable device pagination and sender restarts discover every target without duplicates", async () => {
  const e = await setup({ batchSize: 2 }), bindings = [];
  for (let i = 0; i < 5; i++) bindings.push(await e.binding());
  await e.general();
  for (let i = 0; i < 5; i++) await e.factory().prepareJob(e.jobId());
  assert.equal(e.count(P.targets), 5);
  for (const b of bindings) await e.factory().dispatch(e.target(b));
  assert.equal(e.calls.length, 5); assert.equal(e.records.get(`${W.deliveries}/${e.jobId()}`).status, "dispatched");
});
test("two senders racing the same target make one provider call, accepted is terminal", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  await Promise.all(Array.from({ length: 6 }, () => e.factory().dispatch(e.target(b))));
  await e.sender.dispatch(e.target(b)); assert.equal(e.calls.length, 1); assert.equal(e.state(b).attempts, 1);
});
test("known retryable FCM rejection backs off, retries only while eligible and stops after five attempts", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  e.provider(async () => { throw Object.assign(new Error("PRIVATE_TOKEN"), { code: "messaging/server-unavailable" }); });
  for (let i = 1; i <= 5; i++) {
    await e.sender.dispatch(e.target(b)); assert.equal(e.calls.length, i);
    await e.sender.dispatch(e.target(b)); assert.equal(e.calls.length, i);
    e.advance(60000 * 2 ** (i - 1));
  }
  assert.equal(e.state(b).status, "failed"); assert.equal(e.state(b).attempts, 5);
  assert.equal(JSON.stringify(e.state(b)).includes("PRIVATE_TOKEN"), false);
});
test("timeout/late provider completion stays unknown and is never automatically retried", async () => {
  const e = await setup({ timeoutMs: 5 }), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  let finish; e.provider(() => new Promise((resolve) => { finish = resolve; }));
  await e.sender.dispatch(e.target(b)); assert.equal(e.state(b).status, "unknown");
  finish("projects/TEST/messages/LATE"); e.advance(900000); await e.factory().dispatch(e.target(b));
  assert.equal(e.calls.length, 1); assert.equal(e.state(b).status, "unknown");
});
test("FCM Retry-After delays the next known-failure retry beyond local backoff", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  e.provider(async () => { throw { code: "messaging/server-unavailable", httpResponse: { headers: { "retry-after": "180" } } }; });
  await e.sender.dispatch(e.target(b)); e.advance(60000); await e.sender.dispatch(e.target(b)); assert.equal(e.calls.length, 1);
  e.advance(120000); await e.sender.dispatch(e.target(b)); assert.equal(e.calls.length, 2);
});
test("process lost after sending started recovers as unknown, a merely leased target is safely reclaimable", async () => {
  const e = await setup(), a = await e.binding(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  e.put(`${P.targets}/${e.target(a)}`, { ...e.state(a), status: "sending", leaseUntil: e.Timestamp.fromMillis(1), attempts: 1 });
  e.put(`${P.targets}/${e.target(b)}`, { ...e.state(b), status: "leased", leaseUntil: e.Timestamp.fromMillis(1) });
  await e.sender.dispatch(e.target(a)); await e.sender.dispatch(e.target(b));
  assert.equal(e.state(a).status, "unknown"); assert.equal(e.calls.length, 1); assert.equal(e.calls[0].token, b.token);
});
test("unknown SDK and network errors never enter automatic retry", async () => {
  for (const code of ["ETIMEDOUT", "ECONNRESET", "messaging/internal-error", "app/network-error", "UNRECOGNIZED_PRIVATE"]) {
    assert.equal(classifyPushError({ code }).status, "unknown");
  }
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  e.provider(async () => { throw new Error("PRIVATE_TOKEN_AND_GPS"); });
  await e.sender.dispatch(e.target(b)); assert.equal(e.state(b).status, "unknown");
  assert.equal(JSON.stringify(e.state(b)).includes("PRIVATE_TOKEN_AND_GPS"), false);
});
test("provider acceptance followed by lost database commit cannot cause an automatic second send", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  e.provider(async () => { e.failCommits(); return "projects/TEST/messages/ACCEPTED"; });
  await assert.rejects(e.sender.dispatch(e.target(b)));
  e.failCommits(false); e.advance(30001); await e.factory().dispatch(e.target(b));
  assert.equal(e.state(b).status, "unknown"); assert.equal(e.calls.length, 1);
});
test("token refresh before send uses the current claimed token without changing the logical event", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  await e.refresh(b, "TEST_TOKEN_NEW"); await e.sender.dispatch(e.target(b));
  assert.equal(e.calls[0].token, "TEST_TOKEN_NEW"); assert.equal(e.calls[0].data.eventId, e.jobId());
});
test("invalid token removes only the rejected current token, retains binding and forces revision reconciliation", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  e.provider(async () => { throw { code: "messaging/registration-token-not-registered" }; });
  await e.sender.dispatch(e.target(b));
  const d = e.records.get(`${D.devices}/${b.installationId}`);
  assert.equal(d.fcmToken, null); assert.equal(d.bindingId, b.bindingId); assert.equal(d.active, true);
  assert.equal(d.revision, 2); assert.equal(e.state(b).status, "failed");
});
test("late invalid-token response does not erase a new token or a new account binding", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  e.provider(async () => { await e.refresh(b, "TEST_TOKEN_NEW"); throw { code: "messaging/registration-token-not-registered" }; });
  await e.sender.dispatch(e.target(b)); assert.equal(e.records.get(`${D.devices}/${b.installationId}`).fcmToken, "TEST_TOKEN_NEW");
});
test("a late FCM failure for account A cannot clear account B's new binding/token", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  e.put("users/other-resident", { role: "resident", isActive: true });
  e.provider(async () => {
    await e.devices.unregister("resident", b.installationId, b);
    const state = (await e.devices.installation("other-resident", b.installationId, b.secret)).installation;
    await e.devices.register("other-resident", b.installationId, b.secret, { platform: "android", fcmToken: "TEST_ACCOUNT_B_TOKEN",
      notificationPermission: "granted", registrationId: randomUUID(), expectedBindingId: state.bindingId, expectedRevision: state.revision });
    throw { code: "messaging/registration-token-not-registered" };
  });
  await e.sender.dispatch(e.target(b)); const d = e.records.get(`${D.devices}/${b.installationId}`);
  assert.equal(d.ownerId, "other-resident"); assert.equal(d.fcmToken, "TEST_ACCOUNT_B_TOKEN"); assert.notEqual(d.bindingId, b.bindingId);
});
test("logout, revoked permission, missing token claim or changed account cancels before provider", async () => {
  for (const change of ["logout", "permission", "claim", "role", "inactive"]) {
    const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
    if (change === "logout") await e.devices.unregister("resident", b.installationId, b);
    if (change === "permission") await e.refresh(b, b.token, "denied");
    if (change === "claim") for (const [path, data] of e.records) if (path.startsWith(`${D.tokens}/`)) e.put(path, { ...data, active: false });
    if (change === "role") e.put("users/resident", { role: "rescue", isActive: true });
    if (change === "inactive") e.put("users/resident", { role: "resident", isActive: false });
    await e.sender.dispatch(e.target(b)); assert.equal(e.calls.length, 0, change); assert.equal(e.state(b).status, "canceled", change);
  }
});
test("account revocation during preflight transaction retry cannot send", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  // Lease transaction completes first; inject revocation while loading the leased target.
  const original = e.db.runTransaction; let count = 0;
  e.db.runTransaction = async (fn) => { if (++count === 2) e.beforeCommit(() => e.put("users/resident", { role: "rescue", isActive: true })); return original(fn); };
  await e.sender.dispatch(e.target(b)); assert.equal(e.calls.length, 0);
});
test("near/inside is sent only to its originating installation and TTL is zero", async () => {
  const e = await setup(), a = await e.binding(), b = await e.binding(); const id = await e.location(a);
  await e.sender.prepareJob(id); await e.sender.dispatch(e.target(a, "inside")); await e.sender.dispatch(e.target(b, "inside"));
  assert.equal(e.calls.length, 1); assert.equal(e.calls[0].token, a.token); assert.equal(e.calls[0].android.ttl, 0);
});
test("GPS expiry or permission loss between job creation and send cannot display stale position", async () => {
  const e = await setup(), b = await e.binding(); const id = await e.location(b);
  await e.sender.prepareJob(id); e.advance(60001); await e.sender.dispatch(e.target(b, "inside"));
  assert.equal(e.calls.length, 0); assert.equal(e.state(b, "inside").status, "canceled");
});
test("fresh GPS with same relevant regions keeps location job; inside consumes pending near", async () => {
  const e = await setup(), b = await e.binding(); const id = await e.location(b, true);
  await e.sender.prepareJob(id); await e.location(b, false, 2);
  await e.sender.dispatch(e.target(b, "near")); assert.equal(e.calls.length, 0);
  await e.sender.prepareJob(e.jobId("inside")); await e.location(b, false, 3);
  const z = h.zones(); z.zonesRevision = "TEST_UNRELATED_CHANGE"; e.zones(z);
  await e.sender.dispatch(e.target(b, "inside")); assert.equal(e.calls.length, 1);
});
test("changed relevant source cancels a stale location payload; missing zones defers without provider", async () => {
  for (const failure of [false, true]) {
    const e = await setup(), b = await e.binding(); await e.location(b); await e.sender.prepareJob(e.jobId("inside"));
    if (failure) e.failZones(); else { const z = h.zones(); z.geojson.features[0].properties.source = "TEST_CHANGED"; e.zones(z); }
    await e.sender.dispatch(e.target(b, "inside")); assert.equal(e.calls.length, 0);
    assert.equal(e.state(b, "inside").status, failure ? "retry" : "canceled");
    assert.equal(e.state(b, "inside").attempts, 0);
  }
});
test("deactivation before provider cancels even after job targets were dispatched", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  await e.api.deactivate("admin", e.alert.id, {}); await e.sender.dispatch(e.target(b)); assert.equal(e.calls.length, 0);
});
test("deactivation control is durable, data-only, deduplicated and never a fourth visible notification", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId()); await e.sender.dispatch(e.target(b));
  await e.api.deactivate("admin", e.alert.id, {}); const id = c.hash([e.alert.id, "deactivated"]);
  await e.worker.processDeactivatedEvent(id); await e.sender.prepareControl(id); await e.sender.prepareControl(id);
  const controlId = c.hash(["resident", e.alert.id, "deactivated"]);
  await e.sender.prepareJob(controlId, true);
  const t = targetId(controlId, b.installationId, b.bindingId);
  await Promise.all([e.sender.dispatch(t), e.factory().dispatch(t)]);
  assert.equal(e.calls.length, 2); const m = e.calls[1]; assert.equal(m.data.kind, "deactivated");
  assert.equal(m.data.title, ""); assert.equal(m.data.body, ""); assert.equal(m.notification, undefined);
  assert.equal(e.count(P.controls), 1);
});
test("deactivation during an in-flight provider cannot recall it; control and client reconciliation remain possible", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  e.provider(async () => { await e.api.deactivate("admin", e.alert.id, {}); return "projects/TEST/messages/IN_FLIGHT"; });
  await e.sender.dispatch(e.target(b)); assert.equal(e.state(b).status, "accepted");
  assert.equal((await e.api.detail("resident", e.alert.id)).floodAlert.status, "inactive");
});
test("test audience filter blocks existing jobs/targets for non-test users without consuming them", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.sender.prepareJob(e.jobId());
  const sender = e.factory({ allows: () => false }); await sender.dispatch(e.target(b));
  assert.equal(e.calls.length, 0); assert.equal(e.state(b).status, "pending");
});
test("test mode retains non-allowlisted deactivation controls for a later live sender", async () => {
  const e = await setup(), b = await e.binding(); await e.general(); await e.api.deactivate("admin", e.alert.id, {});
  const off = c.hash([e.alert.id, "deactivated"]); await e.worker.processDeactivatedEvent(off);
  await e.factory({ allows: () => false }).prepareControl(off);
  const id = c.hash(["resident", e.alert.id, "deactivated"]);
  assert.equal(e.records.get(`${P.controls}/${id}`).status, "pending");
  await e.sender.prepareJob(id, true); await e.sender.dispatch(targetId(id, b.installationId, b.bindingId));
  assert.equal(e.calls.length, 1); assert.equal(e.calls[0].data.kind, "deactivated");
});
test("long Unicode text stays within FCM byte budget and data excludes secrets/GPS", async () => {
  const data = pushMessage({ kind: "general", eventId: "TEST_EVENT", alertId: "TEST_ALERT", createdAt: { toDate: () => new Date() },
    payload: { title: "🌊".repeat(180), body: "🌊".repeat(4000) } }, { installationId: randomUUID(), bindingId: randomUUID() }, "PRIVATE_TOKEN");
  assert.ok(Buffer.byteLength(JSON.stringify(data.data)) < 3500);
  assert.ok(Buffer.byteLength(data.data.title) <= 600); assert.ok(Buffer.byteLength(data.data.body) <= 2000);
  assert.equal(JSON.stringify(data.data).includes("PRIVATE_TOKEN"), false);
  assert.equal(Object.hasOwn(data.data, "latitude"), false);
  assert.equal((await sendPush({ send: async () => null }, data, 10)).status, "unknown");
});
test("tick durable scan resumes after restart and contains DB failure without logging private data", async () => {
  const e = await setup(), b = await e.binding(); await e.general();
  e.failReads(); assert.deepEqual((await e.sender.tick()).failedScans, ["control_events", "jobs", "controls", "targets"]);
  e.failReads(false); await e.factory().tick(); await e.factory().tick(); assert.equal(e.calls.length, 1);
  assert.equal(e.state(b).status, "accepted");
});
