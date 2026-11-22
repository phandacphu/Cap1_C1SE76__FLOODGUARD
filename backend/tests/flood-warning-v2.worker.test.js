const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { createTestDb } = require("./helpers/warning-v2-test-db");
const { createFloodWarningV2Service } = require("../src/services/flood-warning-v2.service");
const { createWarningDeviceService, DEVICE_COLLECTIONS: D } = require("../src/services/warning-v2-device.service");
const { createWarningV2EventWorker, WORKER_COLLECTIONS: W, ledgerId, deliveryId } = require("../src/services/warning-v2-event-worker.service");
const c = require("../src/services/flood-warning-v2-contract");
const h = require("./helpers/warning-v2-geography");
async function setup() {
  const e = createTestDb(); let now = Date.now(), currentZones = h.zones(), brokenZones = false;
  const zonesService = { async load() { if (brokenZones) throw new Error("SIMULATED_REGION_FAILURE_PRIVATE"); return currentZones; } };
  const api = createFloodWarningV2Service({ db: e.db, zonesService }), devices = createWarningDeviceService({ db: e.db, zonesService, clock: () => now });
  const makeWorker = (batchSize = 20) => createWarningV2EventWorker({ db: e.db, zonesService, clock: () => now, batchSize });
  const worker = makeWorker();
  async function alert(title = "TEST ONLY - Cảnh báo") { return (await api.create("admin", randomUUID(), { title, content: "TEST ONLY - Nội dung" })).floodAlert; }
  const initial = await alert();
  async function binding(actor = "resident") {
    const installationId = randomUUID(), secret = randomBytes(32).toString("base64url");
    const device = (await devices.register(actor, installationId, secret, { platform: "android", fcmToken: null,
      notificationPermission: "denied", registrationId: randomUUID(), expectedBindingId: null, expectedRevision: 0 })).device;
    return { installationId, bindingId: device.bindingId, secret, actor };
  }
  const sample = (sequence = 1, point = { latitude: -0.025, longitude: 0.025 }, overrides = {}) => ({ sequence,
    availability: "available", reason: null, location: point, capturedAt: new Date(now).toISOString(), accuracyM: 20, ...overrides });
  const upload = (b, body = sample()) => devices.upload(b.actor, b, body);
  const generalId = (a = initial) => c.hash([a.id, "general"]);
  const job = (kind, a = initial, resident = "resident") => e.records.get(`${W.deliveries}/${deliveryId(resident, a.id, kind)}`);
  const ledger = (a = initial, resident = "resident") => e.records.get(`${W.ledger}/${ledgerId(resident, a.id)}`);
  async function generalPass(w = worker, a = initial, limit = 20) {
    const previous = e.records.get(`${W.events}/${generalId(a)}`).fanout?.pass ?? 0;
    for (let n = 0; n < 50; n++) {
      await w.processGeneralEvent(generalId(a), limit);
      if ((e.records.get(`${W.events}/${generalId(a)}`).fanout?.pass ?? 0) > previous) return;
    }
    throw new Error("TEST ONLY - general cursor did not finish");
  }
  return { ...e, api, devices, worker, makeWorker, alert, initial, binding, sample, upload, generalId, generalPass, job, ledger,
    near: (meters = 500) => ({ latitude: meters / h.EARTH_RADIUS_M * 180 / Math.PI, longitude: 0.025 }),
    advance: (ms) => { now += ms; }, setZones: (zones) => { currentZones = zones; }, failZones: (value = true) => { brokenZones = value; } };
}

test("general fan-out reaches every active Resident without GPS/device/token; never Admin/Rescue/inactive", async () => {
  const e = await setup();
  e.put("users/no-gps", { role: "resident", isActive: true }); e.put("users/disabled-resident", { role: "resident", isActive: false });
  await e.generalPass(e.worker, e.initial, 2);
  assert.equal(e.count(W.deliveries), 2);
  assert.ok(e.job("general")); assert.ok(e.job("general", e.initial, "no-gps"));
  assert.equal(e.job("general").status, "pending"); assert.equal(e.job("general").origin, null);
});
test("durable cursor survives restart; later Residents before the cursor are caught next pass without duplicates", async () => {
  const e = await setup();
  for (let i = 0; i < 7; i++) e.put(`users/r${i}`, { role: "resident", isActive: true });
  await e.worker.processGeneralEvent(e.generalId(), 2);
  assert.ok(e.records.get(`${W.events}/${e.generalId()}`).fanout.cursor);
  await e.generalPass(e.makeWorker(), e.initial, 2); assert.equal(e.count(W.deliveries), 8);
  e.put("users/000-new", { role: "resident", isActive: true });
  await e.generalPass(e.makeWorker(), e.initial, 2); assert.equal(e.count(W.deliveries), 9);
  await e.generalPass(e.makeWorker(), e.initial, 2); assert.equal(e.count(W.deliveries), 9);
});
test("concurrent general workers create exactly one receipt/job per Resident; immutable creation payload survives edits", async () => {
  const e = await setup();
  await e.api.update("admin", e.initial.id, { expectedRevision: 1, title: "TEST ONLY - Edited" });
  await Promise.all(Array.from({ length: 6 }, () => e.makeWorker().processGeneralEvent(e.generalId())));
  assert.equal(e.count(W.deliveries), 1); assert.equal(e.count(W.ledger), 1);
  assert.equal(e.job("general").payload.title, e.initial.title); assert.equal(e.job("general").alertRevision, 1);
  await e.generalPass(); assert.equal(e.count(W.deliveries), 1);
});
test("near then inside records at most three kinds; inside cancels pending near and no reentry resets receipts", async () => {
  const e = await setup(), b = await e.binding(); await e.generalPass();
  await e.upload(b, e.sample(1, e.near(500))); await e.worker.processDevice(b.installationId);
  assert.equal(e.job("near").status, "pending");
  await e.upload(b, e.sample(2)); await e.worker.processDevice(b.installationId);
  assert.equal(e.job("inside").status, "pending"); assert.equal(e.job("near").status, "canceled");
  assert.equal(e.job("near").cancellationReason, "inside_recorded");
  for (let seq = 3; seq <= 8; seq++) {
    await e.upload(b, e.sample(seq, seq % 2 ? e.near(501) : e.near(499))); await e.worker.processDevice(b.installationId);
  }
  assert.equal(e.count(W.deliveries), 3); assert.equal(e.ledger().inside, true); assert.equal(e.ledger().near, true);
});
test("inside first prevents later near across multiple devices and account re-registration", async () => {
  const e = await setup(), first = await e.binding(), second = await e.binding();
  await e.upload(first); await e.upload(second, e.sample(1, e.near(499)));
  await e.worker.processDevice(first.installationId); await e.worker.processDevice(second.installationId);
  assert.ok(e.job("inside")); assert.equal(e.job("near"), undefined);
  await e.devices.unregister("resident", first.installationId, first);
  const third = await e.binding(); await e.upload(third, e.sample(1, e.near(500))); await e.worker.processDevice(third.installationId);
  assert.equal(e.count(W.deliveries), 1); await e.generalPass(); assert.ok(e.job("general"));
});
test("multi-device near/inside races deduplicate per user+alert, not installation", async () => {
  const e = await setup(), a = await e.binding(), b = await e.binding();
  await e.upload(a); await e.upload(b);
  await Promise.all([e.worker.processDevice(a.installationId), e.makeWorker().processDevice(b.installationId)]);
  assert.equal(e.count(W.deliveries), 1); assert.equal(e.count(W.ledger), 1);
  assert.equal(e.job("inside").kind, "inside");
});
test("overlapping current/history/low-lying regions make one location job with distinct truthful wording", async () => {
  const e = await setup(), z = h.zones([h.square(), h.square(), h.square()]);
  z.geojson.features.forEach((f, i) => { f.properties.group = ["current_flood", "historical_flood", "low_lying"][i]; });
  e.setZones(z); const b = await e.binding(); await e.upload(b); await e.worker.processDevice(b.installationId);
  assert.equal(e.count(W.deliveries), 1); const job = e.job("inside"); assert.equal(job.context.matchCount, 3);
  assert.match(job.payload.body, /từng ghi nhận ngập/); assert.match(job.payload.body, /vùng trũng/);
  assert.match(job.payload.body, /vùng ngập được hệ thống ghi nhận/);
  assert.equal(JSON.stringify(job).includes('"latitude"'), false); assert.equal(JSON.stringify(job).includes(b.secret), false);
});
test("GPS age/accuracy/unavailable/far do not consume location kinds; fresh eligible GPS can notify later", async () => {
  const e = await setup(), b = await e.binding();
  await e.upload(b, e.sample(1, e.near(501))); await e.worker.processDevice(b.installationId); assert.equal(e.count(W.ledger), 0);
  await e.upload(b, e.sample(2, undefined, { accuracyM: 101 })); await e.worker.processDevice(b.installationId); assert.equal(e.count(W.ledger), 0);
  await e.upload(b, e.sample(3, undefined, { capturedAt: new Date(Date.now() - 70000).toISOString() }));
  await e.worker.processDevice(b.installationId); assert.equal(e.count(W.ledger), 0);
  await e.upload(b, e.sample(4, null, { availability: "unavailable", reason: "permission_denied", capturedAt: null, accuracyM: null }));
  await e.worker.processDevice(b.installationId); assert.equal(e.count(W.ledger), 0);
  await e.upload(b, e.sample(5, e.near(500), { accuracyM: 100 })); await e.worker.processDevice(b.installationId); assert.ok(e.job("near"));
});
test("partial coverage allows real matches but no-match/unknown never consumes a location receipt", async () => {
  const e = await setup(), b = await e.binding();
  e.setZones(h.zones([], { status: "unavailable" })); await e.upload(b); await e.worker.processDevice(b.installationId); assert.equal(e.count(W.deliveries), 0);
  e.setZones(h.zones([h.square(10, 10)], { status: "partial" })); await e.worker.processDevice(b.installationId); assert.equal(e.count(W.deliveries), 0);
  e.setZones(h.zones([h.square()], { status: "partial" })); await e.worker.processDevice(b.installationId);
  assert.equal(e.job("inside").context.coverageStatus, "partial");
});
test("superseded GPS event cannot queue old location; periodic device pass handles the latest sample", async () => {
  const e = await setup(), b = await e.binding(); await e.upload(b);
  const oldId = c.hash([b.installationId, b.bindingId, 1]);
  await e.upload(b, e.sample(2, e.near(501))); await e.worker.processLocationEvent(oldId);
  assert.equal(e.records.get(`${D.events}/${oldId}`).status, "superseded"); assert.equal(e.count(W.deliveries), 0);
  await e.upload(b, e.sample(3)); const latestId = c.hash([b.installationId, b.bindingId, 3]);
  await Promise.all([e.worker.processLocationEvent(latestId), e.makeWorker().processLocationEvent(latestId)]);
  assert.equal(e.count(W.deliveries), 1); assert.equal(e.job("inside").origin.sequence, 3);
});
test("region edits reevaluate the same fresh GPS without upload; a new bulletin gets its own receipt", async () => {
  const e = await setup(), b = await e.binding(); e.setZones(h.zones([h.square(20, 20)]));
  await e.upload(b); await e.worker.processDevice(b.installationId); assert.equal(e.count(W.deliveries), 0);
  const changed = h.zones(); changed.zonesRevision = "TEST-NEW-REV"; e.setZones(changed);
  await e.worker.processDevice(b.installationId); assert.ok(e.job("inside"));
  const second = await e.alert("TEST ONLY - New storm"); await e.worker.processDevice(b.installationId);
  assert.ok(e.job("inside", second)); assert.equal(e.count(W.ledger), 2);
});
test("per-device alert pagination reaches all active bulletins across worker restarts", async () => {
  const e = await setup(), b = await e.binding(); await e.upload(b);
  for (let n = 0; n < 5; n++) await e.alert();
  for (let n = 0; n < 5; n++) await e.makeWorker(2).processDevice(b.installationId);
  assert.equal(e.count(W.deliveries), 6); assert.equal(e.count(W.ledger), 6);
});
test("transaction failure cannot leave a receipt without a job or advance the fan-out cursor", async () => {
  const e = await setup(); e.failCommits(); await assert.rejects(e.worker.processGeneralEvent(e.generalId()));
  assert.equal(e.count(W.deliveries), 0); assert.equal(e.count(W.ledger), 0);
  assert.equal(e.records.get(`${W.events}/${e.generalId()}`).fanout, undefined);
  e.failCommits(false); await e.generalPass(); assert.equal(e.count(W.deliveries), 1);
});
test("unknown commit response retries safely without a second job", async () => {
  const e = await setup(); e.afterCommit(() => { throw new Error("SIMULATED_LOST_RESPONSE"); });
  await assert.rejects(e.worker.processGeneralEvent(e.generalId()));
  assert.equal(e.count(W.deliveries), 1); await e.generalPass(); assert.equal(e.count(W.deliveries), 1);
});
test("role revocation during transaction retry prevents fan-out; role restoration catches up next pass", async () => {
  const e = await setup(); e.beforeCommit(() => e.put("users/resident", { role: "rescue", isActive: true }));
  await e.generalPass(); assert.equal(e.count(W.deliveries), 0);
  e.put("users/resident", { role: "resident", isActive: true }); await e.generalPass(); assert.equal(e.count(W.deliveries), 1);
});
test("deactivation racing fan-out cannot create a job after inactive", async () => {
  const e = await setup(); e.beforeCommit(() => e.api.deactivate("admin", e.initial.id, {}));
  await e.worker.processGeneralEvent(e.generalId()); assert.equal(e.count(W.deliveries), 0);
  assert.equal((await e.api.detail("resident", e.initial.id)).floodAlert.status, "inactive");
});
test("logout/rebind during location transaction retry prevents stale-account job creation", async () => {
  const e = await setup(), b = await e.binding(); await e.upload(b);
  e.beforeCommit(() => e.devices.unregister("resident", b.installationId, b));
  await e.worker.processDevice(b.installationId); assert.equal(e.count(W.deliveries), 0);
});
test("cancellation removes stale/superseded location jobs while preserving consumed kind receipts", async () => {
  const e = await setup(), b = await e.binding(); await e.upload(b); await e.worker.processDevice(b.installationId);
  const id = deliveryId("resident", e.initial.id, "inside");
  e.advance(60000); assert.equal((await e.worker.cancelDelivery(id)).canceled, 0);
  e.advance(1); assert.equal((await e.worker.cancelDelivery(id)).canceled, 1);
  assert.equal(e.job("inside").cancellationReason, "location_no_longer_eligible"); assert.equal(e.ledger().inside, true);
  await e.upload(b, e.sample(2)); await e.worker.processDevice(b.installationId); assert.equal(e.count(W.deliveries), 1);
});
test("no-longer-matching GPS/binding/region or ineligible account cancels jobs without resetting dedupe", async () => {
  for (const change of ["sequence", "binding", "regions", "account"]) {
    const e = await setup(), b = await e.binding(); await e.upload(b); await e.worker.processDevice(b.installationId);
    if (change === "sequence") await e.upload(b, e.sample(2, e.near(501)));
    if (change === "binding") await e.devices.unregister("resident", b.installationId, b);
    if (change === "regions") { const z = h.zones(); z.zonesRevision = "TEST-CHANGED"; z.geojson.features[0].properties.source = "TEST NEW SOURCE"; e.setZones(z); }
    if (change === "account") e.put("users/resident", { role: "resident", isActive: false });
    assert.equal((await e.worker.cancelDelivery(deliveryId("resident", e.initial.id, "inside"))).canceled, 1);
    assert.equal(e.ledger().inside, true);
  }
});
test("new GPS that still matches the same regions and unrelated region revisions keep the pending job", async () => {
  const e = await setup(), b = await e.binding(); await e.upload(b); await e.worker.processDevice(b.installationId);
  await e.upload(b, e.sample(2)); const changed = h.zones(); changed.zonesRevision = "TEST-UNRELATED-CHANGE";
  e.setZones(changed);
  assert.equal((await e.worker.cancelDelivery(deliveryId("resident", e.initial.id, "inside"))).canceled, 0);
  assert.equal(e.job("inside").origin.sequence, 1); assert.equal(e.job("inside").status, "pending");
});
test("GPS expiring during a transaction retry cannot consume a location kind", async () => {
  const e = await setup(), b = await e.binding(); await e.upload(b);
  e.beforeCommit(() => { e.advance(60001); e.put("users/resident", { role: "resident", isActive: true }); });
  await e.worker.processDevice(b.installationId);
  assert.equal(e.count(W.deliveries), 0); assert.equal(e.count(W.ledger), 0);
});
test("deactivation cancels all pending kinds in bounded batches even if region loading fails", async () => {
  const e = await setup(), b = await e.binding(); await e.generalPass(); await e.upload(b, e.sample(1, e.near(500)));
  await e.worker.processDevice(b.installationId); await e.upload(b, e.sample(2)); await e.worker.processDevice(b.installationId);
  await e.api.deactivate("admin", e.initial.id, {}); e.failZones(); const offId = c.hash([e.initial.id, "deactivated"]);
  for (let n = 0; n < 5; n++) await e.worker.processDeactivatedEvent(offId, { limit: 1 });
  for (const kind of ["general", "near", "inside"]) assert.equal(e.job(kind).status, "canceled");
  assert.equal(e.records.get(`${W.events}/${offId}`).cancellationComplete, true);
  assert.equal(e.ledger().general, true); assert.equal(e.ledger().inside, true);
});
test("tick scan errors are contained with durable cursors and no raw error/private data in summary", async () => {
  const e = await setup(); e.failReads(); const failed = await e.worker.tick();
  assert.deepEqual(failed.failedScans, ["events", "gps", "devices", "deliveries"]);
  assert.equal(e.count(W.cursors), 0); assert.equal(JSON.stringify(failed).includes("SIMULATED"), false);
  e.failReads(false); await e.worker.tick(); assert.ok(e.job("general"));
  await e.makeWorker().tick(); assert.equal(e.count(W.deliveries), 1);
});
