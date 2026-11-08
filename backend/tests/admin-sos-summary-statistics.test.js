const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");
const h = require("./helpers/sos-test-app");
beforeEach(h.reset);
function fixture() {
  for (const status of [
    "submitted",
    "received",
    "in_progress",
    "assisted",
    "cancelled",
    "unknown",
  ])
    h.seedRequest(status, { status });
}
test("summary reconciles active/rescued/other without treating cancellation as rescue", async () => {
  fixture();
  await h.withApi(async (api) => {
    const before = [...h.records.entries()];
    const r = await api("/api/admin/rescue-requests/summary", {
      actor: "admin",
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data, {
      total: 6,
      active: 3,
      rescued: 1,
      legacyOther: 2,
      byStatus: {
        submitted: 1,
        received: 1,
        in_progress: 1,
        assisted: 1,
        cancelled: 1,
      },
    });
    assert.equal(
      r.body.data.total,
      r.body.data.active + r.body.data.rescued + r.body.data.legacyOther,
    );
    assert.deepEqual([...h.records.entries()], before);
    assert.equal(Object.hasOwn(r.body.data, "byUrgency"), false);
  });
});
test("list and summary share state/date filters with inclusive boundaries", async () => {
  fixture();
  await h.withApi(async (api) => {
    const suffixes = [
      "",
      "?state=active",
      "?state=rescued",
      "?state=legacy_other",
      "?status=received",
      "?from=2026-10-01T00:00:00Z&to=2026-10-01T00:00:00Z",
      "?from=2026-10-01T00:00:01Z",
    ];
    for (const suffix of suffixes) {
      const list = await api(`/api/admin/rescue-requests${suffix}`, {
        actor: "admin",
      });
      const summary = await api(`/api/admin/rescue-requests/summary${suffix}`, {
        actor: "admin",
      });
      assert.equal(list.status, 200);
      assert.equal(summary.status, 200);
      assert.equal(
        summary.body.data.total,
        list.body.data.rescueRequests.length,
      );
    }
  });
});
test("summary rejects unsupported filters, malformed dates, wrong JWT/live role", async () => {
  fixture();
  await h.withApi(async (api) => {
    const path = "/api/admin/rescue-requests/summary";
    for (const query of [
      "?urgency=high",
      "?severity=low",
      "?sort=priority",
      "?page=1",
      "?from=2026-02-30T00:00:00Z",
      "?from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z",
      "?state=active&status=submitted",
      "?state=active&state=rescued",
    ]) {
      assert.equal((await api(path + query, { actor: "admin" })).status, 400);
    }
    for (const [actor, tokenRole, expected] of [
      [null, null, 401],
      ["resident", "resident", 403],
      ["rescue", "rescue", 403],
      ["rescue", "admin", 403],
      ["missing", "admin", 401],
      ["inactive", "admin", 403],
    ]) {
      assert.equal((await api(path, { actor, tokenRole })).status, expected);
    }
  });
});
test("empty summary is zero; API failure is not returned as empty success", async () => {
  await h.withApi(async (api) => {
    assert.equal(
      (await api("/api/admin/rescue-requests/summary", { actor: "admin" })).body
        .data.total,
      0,
    );
    h.failRead();
    const previous = console.error;
    console.error = () => {};
    try {
      const r = await api("/api/admin/rescue-requests/summary", {
        actor: "admin",
      });
      assert.equal(r.status, 500);
      assert.equal(r.body.success, false);
      assert.equal(r.body.data, undefined);
    } finally {
      console.error = previous;
    }
  });
});
