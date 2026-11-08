const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");
const h = require("./helpers/sos-test-app");
const {
  createSosWithHistory: create,
} = require("../src/services/create-sos.service");
const {
  updateRescueStatusWithHistory: complete,
} = require("../src/services/update-rescue-status.service");
const {
  ACTIVE_SOS_COLLECTION,
  activeSosLockId,
} = require("../src/services/sos-contract");
beforeEach(h.reset);
for (const status of ["submitted", "received", "in_progress"]) {
  test(`any active Rescue directly completes ${status} without assignment`, async () => {
    h.seedRequest("sos", { status });
    const original = h.records.get("rescue_requests/sos");
    const result = await complete("sos", "rescue2", { status: "assisted" });
    assert.equal(result.rescueRequest.status, "assisted");
    assert.equal(result.rescueRequest.completedBy, "rescue2");
    assert.ok(result.rescueRequest.completedAt instanceof h.Timestamp);
    assert.deepEqual(result.rescueRequest.location, original.location);
    assert.equal(h.count("rescue_assignments"), 0);
    for (const name of [
      "rescue_request_status_history",
      "audit_logs",
      "notifications",
      "notification_delivery_logs",
    ])
      assert.equal(h.count(name), 1);
    const event = [...h.records.entries()].find(([key]) =>
      key.startsWith("notifications/"),
    )[1];
    assert.equal(event.recipientId, "resident");
    assert.equal(event.statusEvent.oldStatus, status);
    assert.equal(event.statusEvent.newStatus, "assisted");
  });
}
test("completion releases lock and permits next SOS", async () => {
  const first = await create("resident", h.validBody());
  await complete(first.id, "rescue", { status: "assisted" });
  assert.equal(h.count(ACTIVE_SOS_COLLECTION), 0);
  const second = await create("resident", h.validBody());
  assert.notEqual(first.id, second.id);
  assert.equal(h.count("rescue_requests"), 2);
});
test("concurrent rescuers complete once with one history/notification/audit", async () => {
  const request = await create("resident", h.validBody());
  const results = await Promise.allSettled([
    complete(request.id, "rescue", { status: "assisted" }),
    complete(request.id, "rescue2", { status: "assisted" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.find((r) => r.status === "rejected").reason.code,
    "STATUS_TRANSITION_CONFLICT",
  );
  const notification = [...h.records.entries()].find(([key]) => key.startsWith("notifications/"))[1];
  assert.equal(notification.statusEvent.sequence, 1);
  assert.equal(h.count("rescue_request_status_history"), 2);
  for (const name of [
    "audit_logs",
    "notifications",
    "notification_delivery_logs",
  ])
    assert.equal(h.count(name), 1);
  const winner = results.find((r) => r.status === "fulfilled").value
    .rescueRequest.completedBy;
  assert.equal(
    h.records.get(`rescue_requests/${request.id}`).completedBy,
    winner,
  );
  await assert.rejects(complete(request.id, winner, { status: "assisted" }), {
    code: "STATUS_TRANSITION_CONFLICT",
  });
});
test("failed completion rolls back all writes and lock release", async () => {
  const request = await create("resident", h.validBody());
  h.failCommit();
  await assert.rejects(
    complete(request.id, "rescue", { status: "assisted" }),
    /commit failure/,
  );
  assert.equal(
    h.records.get(`rescue_requests/${request.id}`).status,
    "submitted",
  );
  assert.equal(h.count(ACTIVE_SOS_COLLECTION), 1);
  assert.equal(h.count("rescue_request_status_history"), 1);
  for (const name of [
    "audit_logs",
    "notifications",
    "notification_delivery_logs",
  ])
    assert.equal(h.count(name), 0);
});
test("terminal/unknown records cannot be completed", async () => {
  for (const status of ["cancelled", "unknown", "assisted"]) {
    h.seedRequest(status, { status });
    await assert.rejects(complete(status, "rescue", { status: "assisted" }), {
      code: "STATUS_TRANSITION_CONFLICT",
    });
  }
});
test("legacy assignment preserved; other request lock never deleted", async () => {
  h.seedRequest("old", { status: "received" });
  const assignment = {
    requestId: "old",
    rescueStaffId: "someone-else",
    status: "accepted",
  };
  h.records.set("rescue_assignments/old", assignment);
  const key = `${ACTIVE_SOS_COLLECTION}/${activeSosLockId("resident")}`;
  h.records.set(key, { requestId: "other-request" });
  await complete("old", "rescue", { status: "assisted" });
  assert.deepEqual(h.records.get("rescue_assignments/old"), assignment);
  assert.equal(h.records.get(key).requestId, "other-request");
});
test("unavailable owner does not prevent rescue or notify another user", async () => {
  h.seedRequest("old");
  h.records.delete("users/resident");
  await complete("old", "rescue", { status: "assisted" });
  assert.equal(h.count("notifications"), 0);
  assert.equal(h.count("audit_logs"), 1);
});
test("HTTP completion uses live Rescue permission and JWT actor; validates body", async () => {
  h.seedRequest("sos");
  await h.withApi(async (api) => {
    const path = "/api/rescue-requests/sos/status";
    for (const [actor, tokenRole, status] of [
      [null, null, 401],
      ["resident", "resident", 403],
      ["admin", "admin", 403],
      ["admin", "rescue", 403],
      ["missing", "rescue", 401],
    ]) {
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            actor,
            tokenRole,
            body: { status: "assisted" },
          })
        ).status,
        status,
      );
    }
    h.records.get("users/rescue").isActive = false;
    assert.equal(
      (
        await api(path, {
          method: "PATCH",
          actor: "rescue",
          body: { status: "assisted" },
        })
      ).status,
      403,
    );
    h.records.get("users/rescue").isActive = true;
    for (const body of [
      { status: "in_progress" },
      { status: "received" },
      { status: "assisted", completedBy: "spoof" },
      { status: "assisted", note: "x".repeat(201) },
      null,
      [],
    ]) {
      assert.equal(
        (await api(path, { method: "PATCH", actor: "rescue", body })).status,
        400,
      );
    }
    const result = await api(path, {
      method: "PATCH",
      actor: "rescue2",
      body: { status: "assisted" },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.rescueRequest.completedBy, "rescue2");
    assert.equal(
      (
        await api(path, {
          method: "PATCH",
          actor: "rescue",
          body: { status: "assisted" },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await api("/api/rescue-requests/missing/status", {
          method: "PATCH",
          actor: "rescue",
          body: { status: "assisted" },
        })
      ).status,
      404,
    );
  });
});
test("old acceptance cannot move a new SOS into old workflow", async () => {
  const request = await create("resident", h.validBody());
  await h.withApi(async (api) =>
    assert.equal(
      (
        await api(`/api/rescue-requests/${request.id}/accept`, {
          method: "POST",
          actor: "rescue",
          body: {},
        })
      ).status,
      409,
    ),
  );
  assert.equal(
    h.records.get(`rescue_requests/${request.id}`).status,
    "submitted",
  );
  assert.equal(h.count("rescue_assignments"), 0);
});
