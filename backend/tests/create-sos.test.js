const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");
const h = require("./helpers/sos-test-app");
const { createSosWithHistory } = require("../src/services/create-sos.service");
const { ACTIVE_SOS_COLLECTION } = require("../src/services/sos-contract");
beforeEach(h.reset);

test("new Mobile payload creates SOS, initial GPS, lock and initial history atomically", async () => {
  await h.withApi(async (api) => {
    const result = await api("/api/rescue-requests", {
      method: "POST",
      body: h.validBody(),
    });
    assert.equal(result.status, 201);
    const r = result.body.data.rescueRequest;
    assert.equal(r.status, "submitted");
    assert.equal(r.state, "active");
    assert.deepEqual(r.situations, ["trapped", "injured"]);
    assert.equal(r.waterLevel, "waist");
    assert.equal(r.note, "TEST ONLY");
    assert.deepEqual(r.initialLocation, r.location);
    assert.equal(r.locationCapturedAt, null);
    assert.ok(r.locationReceivedAt);
    assert.equal(r.completedAt, null);
    assert.equal(r.completedBy, null);
    assert.equal(Object.hasOwn(r, "urgency"), false);
    const stored = h.records.get(`rescue_requests/${r.id}`);
    assert.equal(stored.schemaVersion, 2);
    assert.equal(Object.hasOwn(stored, "urgency"), false);
    assert.equal(h.count(ACTIVE_SOS_COLLECTION), 1);
    assert.equal(h.count("rescue_request_status_history"), 1);
    const duplicate = await api("/api/rescue-requests", {
      method: "POST",
      body: h.validBody(),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.code, "DUPLICATE_SOS_REQUEST");
    assert.equal(duplicate.body.data.activeRequestId, r.id);
  });
});

test("concurrent POSTs create exactly one active SOS and one initial history", async () => {
  const results = await Promise.allSettled([
    createSosWithHistory("resident", h.validBody()),
    createSosWithHistory("resident", h.validBody()),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.find((r) => r.status === "rejected").reason.code,
    "DUPLICATE_SOS_REQUEST",
  );
  assert.equal(h.count("rescue_requests"), 1);
  assert.equal(h.count("rescue_request_status_history"), 1);
  assert.ok(h.attempts() > 2);
});

for (const status of ["submitted", "received", "in_progress"]) {
  test(`pre-migration ${status} without lock prevents a second active SOS`, async () => {
    h.seedRequest("legacy", { status });
    await assert.rejects(createSosWithHistory("resident", h.validBody()), {
      code: "DUPLICATE_SOS_REQUEST",
    });
    assert.equal(h.count("rescue_requests"), 1);
  });
}

test("completed/cancelled legacy SOS do not block a new SOS; stale lock repaired", async () => {
  h.seedRequest("old", { status: "cancelled" });
  const { activeSosLockId } = require("../src/services/sos-contract");
  h.records.set(`${ACTIVE_SOS_COLLECTION}/${activeSosLockId("resident")}`, {
    requestId: "old",
  });
  const request = await createSosWithHistory("resident", h.validBody());
  assert.equal(
    h.records.get(`${ACTIVE_SOS_COLLECTION}/${activeSosLockId("resident")}`)
      .requestId,
    request.id,
  );
});

test("commit failure leaves no SOS, history or lock", async () => {
  h.failCommit();
  await assert.rejects(
    createSosWithHistory("resident", h.validBody()),
    /commit failure/,
  );
  for (const name of [
    "rescue_requests",
    "rescue_request_status_history",
    ACTIVE_SOS_COLLECTION,
  ])
    assert.equal(h.count(name), 0);
});

test("HTTP create enforces JWT, live role and account state", async () => {
  await h.withApi(async (api) => {
    for (const [actor, tokenRole, expected] of [
      [null, null, 401],
      ["missing", "resident", 401],
      ["admin", "admin", 403],
      ["rescue", "rescue", 403],
      ["inactive", "resident", 403],
      ["admin", "resident", 403],
    ])
      assert.equal(
        (
          await api("/api/rescue-requests", {
            method: "POST",
            body: h.validBody(),
            actor,
            tokenRole,
          })
        ).status,
        expected,
      );
    assert.equal(h.count("rescue_requests"), 0);
  });
});
