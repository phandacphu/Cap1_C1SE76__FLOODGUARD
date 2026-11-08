const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");
const h = require("./helpers/sos-test-app");
const {
  updateSosLocation: update,
} = require("../src/services/sos-location.service");
const {
  updateRescueStatusWithHistory: complete,
} = require("../src/services/update-rescue-status.service");
const {
  createSosWithHistory: create,
} = require("../src/services/create-sos.service");
beforeEach(h.reset);
const input = (capturedAt = "2026-10-01T00:00:30Z") => ({
  location: { latitude: 16.055, longitude: 108.203 },
  capturedAt,
});
test("owner updates latest GPS; initial position stays immutable", async () => {
  const request = await create("resident", h.validBody());
  const captured = new Date(request.createdAt.toMillis() + 1000).toISOString();
  const next = await update(request.id, "resident", input(captured));
  assert.deepEqual(next.initialLocation, request.location);
  assert.deepEqual(next.location, input().location);
  assert.equal(next.locationCapturedAt.toDate().toISOString(), captured);
  assert.ok(next.locationReceivedAt instanceof h.Timestamp);
  assert.equal(h.count("rescue_request_status_history"), 1);
});
test("offline or delayed sample cannot replace newer GPS; reconnect resumes", async () => {
  h.seedRequest("sos");
  await update("sos", "resident", input("2026-10-01T00:02:00Z"));
  const saved = h.records.get("rescue_requests/sos");
  for (const capturedAt of [
    "2026-10-01T00:01:00Z",
    "2026-10-01T00:02:00Z",
    "2026-09-30T23:59:00Z",
  ]) {
    await assert.rejects(update("sos", "resident", input(capturedAt)), {
      code: "STALE_SOS_LOCATION",
    });
    assert.deepEqual(h.records.get("rescue_requests/sos"), saved);
  }
  await update("sos", "resident", input("2026-10-01T00:03:00Z"));
  assert.equal(
    h.records
      .get("rescue_requests/sos")
      .locationCapturedAt.toDate()
      .toISOString(),
    "2026-10-01T00:03:00.000Z",
  );
});
test("concurrent samples leave newer capture as final GPS", async () => {
  h.seedRequest("sos");
  await Promise.allSettled([
    update("sos", "resident", input("2026-10-01T00:02:00Z")),
    update("sos", "resident", input("2026-10-01T00:01:00Z")),
  ]);
  assert.equal(
    h.records
      .get("rescue_requests/sos")
      .locationCapturedAt.toDate()
      .toISOString(),
    "2026-10-01T00:02:00.000Z",
  );
});
test("GPS in flight cannot move SOS after concurrent completion", async () => {
  h.seedRequest("sos");
  h.beforeCommit(() => complete("sos", "rescue", { status: "assisted" }));
  await assert.rejects(update("sos", "resident", input()), {
    code: "SOS_NOT_ACTIVE",
  });
  assert.equal(h.records.get("rescue_requests/sos").status, "assisted");
  assert.deepEqual(h.records.get("rescue_requests/sos").location, {
    latitude: 16,
    longitude: 108,
  });
});
test("completion racing GPS keeps latest committed position", async () => {
  h.seedRequest("sos");
  h.beforeCommit(() => update("sos", "resident", input()));
  await complete("sos", "rescue", { status: "assisted" });
  assert.equal(h.records.get("rescue_requests/sos").status, "assisted");
  assert.deepEqual(
    h.records.get("rescue_requests/sos").location,
    input().location,
  );
  assert.equal(h.count("notifications"), 1);
});
test("GPS HTTP rejects wrong actor, malformed data, future clock and completed SOS", async () => {
  h.seedRequest("sos");
  await h.withApi(async (api) => {
    const path = "/api/rescue-requests/sos/location";
    for (const [actor, tokenRole, expected] of [
      [null, null, 401],
      ["missing", "resident", 401],
      ["other", "resident", 403],
      ["admin", "admin", 403],
      ["rescue", "rescue", 403],
      ["admin", "resident", 403],
      ["inactive", "resident", 403],
    ]) {
      assert.equal(
        (await api(path, { method: "PATCH", actor, tokenRole, body: input() }))
          .status,
        expected,
      );
    }
    for (const body of [
      { location: input().location },
      { ...input(), capturedAt: null },
      { ...input(), capturedAt: new Date(Date.now() + 300000).toISOString() },
      { ...input(), capturedAt: "2026-02-30T00:00:00Z" },
      { ...input(), residentId: "other" },
      { ...input(), location: { latitude: "16", longitude: 108 } },
    ]) {
      assert.equal((await api(path, { method: "PATCH", body })).status, 400);
    }
    assert.equal(
      (
        await api("/api/rescue-requests/missing/location", {
          method: "PATCH",
          body: input(),
        })
      ).status,
      404,
    );
    assert.equal(
      (await api(path, { method: "PATCH", body: input() })).status,
      200,
    );
    assert.equal(
      (await api(path, { method: "PATCH", body: input() })).body.code,
      "STALE_SOS_LOCATION",
    );
    await complete("sos", "rescue", { status: "assisted" });
    const end = await api(path, {
      method: "PATCH",
      body: input("2026-10-01T00:01:00Z"),
    });
    assert.equal(end.status, 409);
    assert.equal(end.body.code, "SOS_NOT_ACTIVE");
  });
});
test("GPS commit failure preserves previous position and timestamps", async () => {
  h.seedRequest("sos");
  const before = h.records.get("rescue_requests/sos");
  h.failCommit();
  await assert.rejects(update("sos", "resident", input()), /commit failure/);
  assert.deepEqual(h.records.get("rescue_requests/sos"), before);
});
