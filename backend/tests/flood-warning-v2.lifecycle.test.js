const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createTestDb } = require("./helpers/warning-v2-test-db");
const { createFloodWarningV2Service, COLLECTIONS: C } = require("../src/services/flood-warning-v2.service");
const env = createTestDb(), service = createFloodWarningV2Service({ db: env.db });
const body = { title: "TEST ONLY - Mưa lớn", content: "Dữ liệu mô phỏng, không phải cảnh báo thực tế." };
const create = (key = randomUUID(), overrides = {}, actor = "admin") => service.create(actor, key, { ...body, ...overrides });
beforeEach(() => env.reset());
const errorCode = (code) => (e) => e.code === code;

test("create records active warning, receipt, immutable outbox and compatible audit atomically", async () => {
  const result = await create();
  const a = result.floodAlert;
  assert.equal(a.schemaVersion, 2); assert.equal(a.status, "active"); assert.equal(a.endAt, null);
  assert.equal(a.scope, "all_published_zones"); assert.equal(a.revision, 1);
  assert.equal(a.startAt, a.createdAt); assert.equal(a.startAt, a.updatedAt);
  assert.deepEqual(Object.keys(a).sort(), ["id", "schemaVersion", "title", "content", "status", "scope", "startAt", "endAt", "createdAt", "updatedAt", "revision"].sort());
  for (const name of Object.values(C)) assert.equal(env.count(name), 1);
  const event = [...env.records.entries()].find(([p]) => p.startsWith(C.events + "/"))[1];
  assert.equal(event.kind, "general"); assert.equal(event.status, "pending"); assert.deepEqual(event.payload, { ...body, scope: a.scope });
  const audit = [...env.records.entries()].find(([p]) => p.startsWith(C.audit + "/"))[1];
  assert.equal(audit.action, "flood_alert.create"); assert.ok(audit.timestamp); assert.equal(audit.metadata.content, undefined);
});
test("concurrent duplicate creates produce one warning/event/audit and one original response", async () => {
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 12 }, () => create(key)));
  assert.equal(new Set(results.map((r) => r.floodAlert.id)).size, 1);
  assert.equal(results.filter((r) => !r.idempotency.replayed).length, 1);
  for (const name of Object.values(C)) assert.equal(env.count(name), 1);
});
test("same key with different content conflicts; same key is scoped to current Admin", async () => {
  const key = randomUUID(); await create(key);
  await assert.rejects(create(key, { title: "Different" }), errorCode("IDEMPOTENCY_CONFLICT"));
  const other = await create(key, {}, "admin2");
  assert.equal(other.idempotency.replayed, false); assert.equal(env.count(C.alerts), 2);
  assert.equal((await service.creationRequest("admin2", key)).floodAlert.id, other.floodAlert.id);
});
test("normalization and immutable receipt survive edit/deactivate/retry without resurrecting", async () => {
  const key = randomUUID(); const first = await create(key, { title: "  " + body.title + "  " });
  const id = first.floodAlert.id;
  const edited = await service.update("admin", id, { expectedRevision: 1, content: "Updated" });
  assert.equal(edited.floodAlert.startAt, first.floodAlert.startAt); assert.equal(edited.floodAlert.revision, 2);
  assert.equal((await create(key)).floodAlert.content, "Updated");
  const ended = await service.deactivate("admin", id, {});
  const replay = await create(key); assert.equal(replay.floodAlert.status, "inactive");
  assert.equal(replay.floodAlert.endAt, ended.floodAlert.endAt); assert.equal(replay.broadcast.status, "canceled");
  assert.equal(env.count(C.alerts), 1); assert.equal(env.count(C.requests), 1);
  const receipt = await service.creationRequest("admin", key); assert.equal(receipt.floodAlert.status, "inactive");
  const event = [...env.records.entries()].find(([p, v]) => p.startsWith(C.events + "/") && v.kind === "general")[1];
  assert.equal(event.payload.content, body.content); assert.equal(event.status, "canceled");
});
test("two edits at same revision: exactly one wins; stale edit rejected, no lost update", async () => {
  const { floodAlert: a } = await create();
  const results = await Promise.allSettled(["One", "Two"].map((title) => service.update("admin", a.id, { expectedRevision: 1, title })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.code, "ALERT_REVISION_CONFLICT");
  assert.equal((await service.detail("resident", a.id)).floodAlert.revision, 2);
  assert.equal(env.count(C.events), 1); assert.equal(env.count(C.audit), 2);
});
test("deactivate is concurrent/retry-safe; inactive edits forbidden; no-op edit has no side effects", async () => {
  const { floodAlert: a } = await create();
  await service.update("admin", a.id, { expectedRevision: 1, title: a.title });
  assert.equal(env.count(C.audit), 1);
  const results = await Promise.all(Array.from({ length: 6 }, () => service.deactivate("admin", a.id)));
  assert.equal(results.filter((r) => r.changed).length, 1);
  assert.equal(new Set(results.map((r) => r.floodAlert.endAt)).size, 1);
  assert.equal(results[0].floodAlert.revision, 2); assert.equal(env.count(C.events), 2); assert.equal(env.count(C.audit), 2);
  await assert.rejects(service.update("admin", a.id, { expectedRevision: 2, title: "Not allowed" }), errorCode("ALERT_ALREADY_INACTIVE"));
});
test("edit racing deactivate always finishes inactive and never resets startAt", async () => {
  const { floodAlert: a } = await create();
  await Promise.allSettled([service.update("admin", a.id, { expectedRevision: 1, title: "Updated" }), service.deactivate("admin", a.id)]);
  const current = (await service.detail("rescue", a.id)).floodAlert;
  assert.equal(current.status, "inactive"); assert.equal(current.startAt, a.startAt); assert.ok(current.endAt);
});
test("DB role and active state override stale JWT claims; transaction rechecks on retry", async () => {
  await assert.rejects(create(randomUUID(), {}, "rescue"), errorCode("ROLE_FORBIDDEN"));
  await assert.rejects(create(randomUUID(), {}, "resident"), errorCode("ROLE_FORBIDDEN"));
  await assert.rejects(create(randomUUID(), {}, "inactive"), errorCode("ACCOUNT_INACTIVE"));
  await assert.rejects(create(randomUUID(), {}, "missing"), errorCode("AUTH_REQUIRED"));
  env.beforeCommit(() => env.put("users/admin", { role: "rescue", isActive: true }));
  await assert.rejects(create(), errorCode("ROLE_FORBIDDEN"));
  assert.equal(env.count(C.alerts), 0); assert.equal(env.count(C.events), 0);
});
test("revoked account cannot replay an old successful operation or view receipt", async () => {
  const key = randomUUID(); await create(key); env.put("users/admin", { role: "admin", isActive: false });
  await assert.rejects(create(key), errorCode("ACCOUNT_INACTIVE"));
  await assert.rejects(service.creationRequest("admin", key), errorCode("ACCOUNT_INACTIVE"));
  assert.equal(env.count(C.alerts), 1);
});
test("failed commit or audit cannot leave a half-created alert/receipt/outbox", async () => {
  for (const failure of [env.failCommits, env.failAudits]) {
    env.reset(); failure(); await assert.rejects(create());
    for (const name of Object.values(C)) assert.equal(env.count(name), 0);
  }
});
test("response read failure after commit is reconciled using the same key, without duplicates", async () => {
  const key = randomUUID(); env.afterCommit(() => env.failReads());
  await assert.rejects(create(key)); assert.equal(env.count(C.alerts), 1);
  env.failReads(false);
  const retry = await create(key); assert.equal(retry.idempotency.replayed, true);
  for (const name of Object.values(C)) assert.equal(env.count(name), 1);
});
test("multiple active alerts, V1 exclusion, filters, summary and deterministic sorting", async () => {
  env.put(C.alerts + "/legacy", { title: "Old", status: "active", severity: "critical" });
  const one = (await create()).floodAlert, two = (await create(randomUUID(), { title: "Other" })).floodAlert;
  assert.equal((await service.list("resident", {})).floodAlerts.length, 2);
  await service.deactivate("admin", one.id, {});
  assert.equal((await service.list("rescue", { status: "active" })).floodAlerts[0].id, two.id);
  assert.equal((await service.list("resident", { q: "  MƯA LỚN " })).floodAlerts.length, 1);
  assert.deepEqual((await service.list("resident", { q: "no match" })).floodAlerts, []);
  const summary = await service.summary("admin"); assert.deepEqual([summary.total, summary.active, summary.inactive], [2, 1, 1]);
  await assert.rejects(service.detail("resident", "legacy"), errorCode("ALERT_NOT_FOUND"));
  await assert.rejects(service.detail("resident", "not-found"), errorCode("ALERT_NOT_FOUND"));
  await assert.rejects(service.creationRequest("admin", randomUUID()), errorCode("CREATION_REQUEST_NOT_FOUND"));
});
test("legacy write fields, whitespace, wrong types and unsupported filters are rejected", async () => {
  for (const extra of [{ severity: "high" }, { areaId: "zone" }, { startAt: "2026-01-01" },
    { endAt: null }, { status: "inactive" }, { schemaVersion: 2 }, { title: " " }, { content: null },
    { title: "x".repeat(181) }, { content: "x".repeat(4001) }]) {
    await assert.rejects(create(randomUUID(), extra), errorCode("INVALID_ALERT_DATA"));
  }
  await assert.rejects(create("bad-key"), errorCode("INVALID_ALERT_DATA"));
  for (const query of [{ severity: "high" }, { areaId: "one" }, { status: "expired" }, { q: ["one"] }, { page: "1" }]) {
    await assert.rejects(service.list("resident", query), errorCode("INVALID_ALERT_QUERY"));
  }
  assert.equal(env.count(C.alerts), 0);
});

test("summary and lists are read-only and count only V2 across every lifecycle state", async () => {
  const one = (await create()).floodAlert;
  await create(randomUUID(), { title: "Second active" });
  await service.deactivate("admin", one.id);
  env.put(C.alerts + "/v1", { status: "active", severity: "critical" });
  const before = [...env.records.entries()];
  env.failCommits(); env.failAudits();
  const s = await service.summary("admin");
  assert.deepEqual([s.total, s.active, s.inactive], [2, 1, 1]);
  await service.list("resident", {}); await service.list("rescue", { status: "inactive" });
  assert.deepEqual([...env.records.entries()], before);
  await assert.rejects(service.summary("resident"), errorCode("ROLE_FORBIDDEN"));
});

test("invalid patch/deactivate body cannot change content, timestamps or queued events", async () => {
  const { floodAlert: a } = await create();
  for (const patch of [{ expectedRevision: 1 }, { expectedRevision: "1", title: "X" },
    { expectedRevision: 1, content: null }, { expectedRevision: 1, status: "inactive" }]) {
    await assert.rejects(service.update("admin", a.id, patch), errorCode("INVALID_ALERT_DATA"));
  }
  await assert.rejects(service.deactivate("admin", a.id, { endAt: "2026-11-22T01:00:00.000Z" }), errorCode("INVALID_ALERT_DATA"));
  assert.deepEqual((await service.detail("admin", a.id)).floodAlert, a);
  assert.equal(env.count(C.events), 1); assert.equal(env.count(C.audit), 1);
});
