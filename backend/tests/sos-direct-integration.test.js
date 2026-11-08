const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");
const h = require("./helpers/sos-test-app");
beforeEach(h.reset);

test("HTTP Resident -> GPS -> Rescue confirmation -> Resident/Admin history", async () => {
  await h.withApi(async (api) => {
    const created = await api("/api/rescue-requests", {
      method: "POST",
      body: h.validBody(),
    });
    assert.equal(created.status, 201);
    const r = created.body.data.rescueRequest;
    const path = `/api/rescue-requests/${r.id}`;
    let list = await api("/api/rescue-requests?state=active", {
      actor: "rescue",
    });
    assert.deepEqual(
      list.body.data.rescueRequests.map((r) => r.id),
      [r.id],
    );
    assert.equal((await api(path, { actor: "other" })).status, 403);
    assert.equal(
      (await api(path + "/history", { actor: "other" })).status,
      403,
    );
    const capturedAt = new Date(Date.parse(r.createdAt) + 1000).toISOString();
    assert.equal(
      (
        await api(path + "/location", {
          method: "PATCH",
          body: {
            location: { latitude: 16.06, longitude: 108.21 },
            capturedAt,
          },
        })
      ).status,
      200,
    );
    const detail = await api(path, { actor: "rescue" });
    assert.deepEqual(detail.body.data.rescueRequest.location, {
      latitude: 16.06,
      longitude: 108.21,
    });
    const beforeAdmin = await api("/api/admin/rescue-requests/summary", {
      actor: "admin",
    });
    assert.equal(beforeAdmin.body.data.active, 1);
    assert.equal(beforeAdmin.body.data.rescued, 0);
    const completed = await api(path + "/status", {
      method: "PATCH",
      actor: "rescue",
      body: { status: "assisted" },
    });
    assert.equal(completed.status, 200);
    list = await api("/api/rescue-requests?state=active", { actor: "rescue" });
    assert.deepEqual(list.body.data.rescueRequests, []);
    const rescued = await api("/api/rescue-requests?state=rescued", {
      actor: "rescue",
    });
    assert.equal(rescued.body.data.rescueRequests[0].id, r.id);
    const own = await api(path);
    assert.equal(own.body.data.rescueRequest.state, "rescued");
    assert.equal(own.body.data.rescueRequest.completedBy, "rescue");
    assert.ok(own.body.data.rescueRequest.completedAt);
    const history = await api(path + "/history");
    assert.deepEqual(
      history.body.data.statusHistory.map((e) => e.newStatus),
      ["submitted", "assisted"],
    );
    const admin = await api(`/api/admin/rescue-requests/${r.id}`, {
      actor: "admin",
    });
    assert.equal(admin.body.data.rescueRequest.state, "rescued");
    assert.deepEqual(
      admin.body.data.rescueRequest.initialLocation,
      r.initialLocation,
    );
    const summary = await api("/api/admin/rescue-requests/summary", {
      actor: "admin",
    });
    assert.equal(summary.body.data.total, 1);
    assert.equal(summary.body.data.active, 0);
    assert.equal(summary.body.data.rescued, 1);
    assert.equal(
      (
        await api(path + "/status", {
          method: "PATCH",
          actor: "admin",
          body: { status: "assisted" },
        })
      ).status,
      403,
    );
    assert.equal(h.count("rescue_requests"), 1);
  });
});

test("account revocation during transaction retry prevents creation or completion", async () => {
  const {
    createSosWithHistory: create,
  } = require("../src/services/create-sos.service");
  const {
    updateRescueStatusWithHistory: complete,
  } = require("../src/services/update-rescue-status.service");
  h.beforeCommit(() => {
    h.records.get("users/resident").isActive = false;
    h.bumpVersion();
  });
  await assert.rejects(create("resident", h.validBody()), {
    code: "SOS_ROLE_FORBIDDEN",
  });
  assert.equal(h.count("rescue_requests"), 0);
  h.reset();
  h.seedRequest("sos");
  h.beforeCommit(() => {
    h.records.get("users/rescue").role = "resident";
    h.bumpVersion();
  });
  await assert.rejects(complete("sos", "rescue", { status: "assisted" }), {
    code: "STATUS_ROLE_FORBIDDEN",
  });
  assert.equal(h.records.get("rescue_requests/sos").status, "submitted");
  assert.equal(h.count("audit_logs"), 0);
});
