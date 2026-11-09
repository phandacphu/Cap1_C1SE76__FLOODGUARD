const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/safe-location-test-app");
const service = require("../src/services/admin-safe-location.service");
const root = "/api/admin/safe-locations";
beforeEach(h.reset);

test("all Admin routes enforce JWT, live role and active account", async () => {
  h.seed();
  await h.withApi(async (api) => {
    for (const [path, method, body] of [
      [root, "GET"],
      [`${root}/location-1`, "GET"],
      [root, "POST", h.body()],
      [`${root}/location-1`, "PATCH", { name: "Changed" }],
      [`${root}/location-1`, "DELETE"],
    ]) {
      assert.equal(
        (await api(path, { method, body, actor: null })).status,
        401,
      );
      assert.equal(
        (await api(path, { method, body, expiresIn: -1 })).status,
        401,
      );
      for (const actor of ["resident", "rescue", "inactive"]) {
        assert.equal((await api(path, { method, body, actor })).status, 403);
      }
      assert.equal(
        (
          await api(path, {
            method,
            body,
            actor: "resident",
            tokenRole: "admin",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api(path, {
            method,
            body,
            actor: "missing",
            tokenRole: "admin",
          })
        ).status,
        401,
      );
    }
    assert.equal(h.count("audit_logs"), 0);
  });
});

test("minimal POST is immediately public, without activation, old fields or caller metadata", async () => {
  await h.withApi(async (api) => {
    const created = await api(root, { method: "POST", body: h.body() });
    assert.equal(created.status, 201);
    const point = created.body.data.safeLocation;
    assert.equal(point.name, "TEST Shelter");
    assert.equal(point.description, "TEST ONLY");
    assert.equal(point.status, undefined);
    assert.equal(point.capacity, undefined);
    assert.ok(point.createdAt.endsWith("Z"));
    const stored = h.records.get(`safe_locations/${point.id}`);
    assert.equal(stored.schemaVersion, 2);
    assert.equal(stored.isDeleted, false);
    assert.equal(Object.hasOwn(stored, "status"), false);
    const visible = (await api("/api/safe-locations", { actor: null })).body
      .data.safeLocations;
    assert.deepEqual(
      visible.map((p) => p.id),
      [point.id],
    );
    const events = [...h.records.values()].filter(
      (v) => v.action === "safe_location.create",
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].actor.id, "admin");
    assert.equal(JSON.stringify(events[0]).includes("TEST Shelter"), false);
  });
});

test("POST/PATCH reject obsolete fields, bad coordinates, empty body and unknown fields", async () => {
  h.seed();
  await h.withApi(async (api) => {
    for (const field of [
      "status",
      "capacity",
      "capacityNote",
      "contactPhone",
      "services",
      "isDeleted",
      "deletedAt",
      "deletedBy",
      "schemaVersion",
      "createdAt",
      "id",
    ]) {
      assert.equal(
        (await api(root, { method: "POST", body: h.body({ [field]: "x" }) }))
          .status,
        400,
      );
      assert.equal(
        (
          await api(`${root}/location-1`, {
            method: "PATCH",
            body: { [field]: "x" },
          })
        ).status,
        400,
      );
    }
    for (const body of [
      {},
      [],
      null,
      { location: { latitude: 1 } },
      { name: " " },
      { location: { latitude: "1", longitude: 1 } },
    ]) {
      assert.equal(
        (await api(`${root}/location-1`, { method: "PATCH", body })).status,
        400,
      );
    }
    assert.equal(h.count("audit_logs"), 0);
  });
});

test("PATCH keeps identity, creation time, unrelated legacy data and services", async () => {
  h.seed("location-1", { extra: "preserve", capacity: 90, status: "active" });
  h.records.set("safe_location_services/water", {
    safeLocationId: "location-1",
    name: "water",
    isAvailable: true,
  });
  const original = h.records
    .get("safe_locations/location-1")
    .createdAt.toMillis();
  await h.withApi(async (api) => {
    const updated = await api(`${root}/location-1`, {
      method: "PATCH",
      body: { name: " Changed ", location: { latitude: 0, longitude: 0 } },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.safeLocation.id, "location-1");
    const saved = h.records.get("safe_locations/location-1");
    assert.equal(saved.createdAt.toMillis(), original);
    assert.equal(saved.extra, "preserve");
    assert.equal(saved.capacity, 90);
    assert.equal(h.records.has("safe_location_services/water"), true);
    const point = (await api("/api/safe-locations/location-1", { actor: null }))
      .body.data.safeLocation;
    assert.equal(point.name, "Changed");
    assert.deepEqual(point.location, { latitude: 0, longitude: 0 });
    assert.equal(point.capacity, undefined);
  });
});

test("normalized no-op does not change updatedAt or add audit", async () => {
  h.seed("location-1", { name: "Same" });
  const before = h.records
    .get("safe_locations/location-1")
    .updatedAt.toMillis();
  await service.updateSafeLocationForAdmin("admin", "location-1", {
    name: " Same ",
  });
  assert.equal(
    h.records.get("safe_locations/location-1").updatedAt.toMillis(),
    before,
  );
  assert.equal(h.count("audit_logs"), 0);
});

test("DELETE is soft, JWT-owned, preserves documents and hides every list/detail", async () => {
  h.seed();
  h.seed("other");
  h.records.set("safe_location_services/water", {
    safeLocationId: "location-1",
    name: "water",
  });
  await h.withApi(async (api) => {
    assert.equal(
      (
        await api(`${root}/location-1`, {
          method: "DELETE",
          body: { deletedBy: "fake" },
        })
      ).status,
      400,
    );
    const deleted = await api(`${root}/location-1`, { method: "DELETE" });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.data.id, "location-1");
    assert.equal(deleted.body.data.deleted, true);
    assert.ok(deleted.body.data.deletedAt.endsWith("Z"));
    const stored = h.records.get("safe_locations/location-1");
    assert.equal(stored.isDeleted, true);
    assert.equal(stored.deletedBy, "admin");
    assert.equal(h.records.has("safe_location_services/water"), true);
    for (const path of [
      root,
      "/api/safe-locations",
      "/api/safe-locations/nearby?latitude=0&longitude=0",
    ]) {
      assert.deepEqual(
        (await api(path)).body.data.safeLocations.map((p) => p.id),
        ["other"],
      );
    }
    for (const path of [`${root}/location-1`, "/api/safe-locations/location-1"])
      assert.equal((await api(path)).status, 404);
    assert.equal(
      (
        await api(`${root}/location-1`, {
          method: "PATCH",
          body: { name: "Resurrect" },
        })
      ).status,
      404,
    );
    const time = stored.deletedAt.toMillis();
    assert.equal(
      (await api(`${root}/location-1`, { method: "DELETE", actor: "admin2" }))
        .status,
      200,
    );
    assert.equal(
      h.records.get("safe_locations/location-1").deletedAt.toMillis(),
      time,
    );
    assert.equal(h.records.get("safe_locations/location-1").deletedBy, "admin");
    assert.equal(h.count("audit_logs"), 1);
  });
});

test("missing IDs stay missing; invalid IDs and all Admin query parameters rejected", async () => {
  await h.withApi(async (api) => {
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const body = method === "PATCH" ? { name: "Changed" } : undefined;
      assert.equal(
        (await api(`${root}/missing`, { method, body })).status,
        404,
      );
      assert.equal((await api(`${root}/a%2Fb`, { method, body })).status, 400);
    }
    for (const method of ["GET", "POST"]) {
      assert.equal(
        (
          await api(`${root}?status=active`, {
            method,
            body: method === "POST" ? h.body() : undefined,
          })
        ).status,
        400,
      );
    }
    assert.equal(h.count("safe_locations"), 0);
  });
});

test("failed create/update/delete commits leave data and audit unchanged; errors are sanitized", async () => {
  h.seed();
  const before = h.records.get("safe_locations/location-1");
  h.setFailCommit();
  await h.withApi(async (api) => {
    for (const [path, method, body] of [
      [root, "POST", h.body()],
      [`${root}/location-1`, "PATCH", { name: "Lost" }],
      [`${root}/location-1`, "DELETE"],
    ]) {
      const result = await api(path, { method, body });
      assert.equal(result.status, 500);
      assert.equal(result.body.message, "Internal server error");
      assert.equal(JSON.stringify(result.body).includes("secret"), false);
    }
  });
  assert.deepEqual(h.records.get("safe_locations/location-1"), before);
  assert.equal(h.count("safe_locations"), 1);
  assert.equal(h.count("audit_logs"), 0);
});

test("role revocation during a transaction retry prevents create/update/delete", async () => {
  for (const action of [
    () => service.createSafeLocationForAdmin("admin", h.body()),
    () =>
      service.updateSafeLocationForAdmin("admin", "location-1", {
        name: "Lost",
      }),
    () => service.deleteSafeLocationForAdmin("admin", "location-1"),
  ]) {
    h.reset();
    h.seed();
    h.beforeCommit(() => {
      h.records.set("users/admin", { role: "resident", isActive: true });
      h.bumpVersion();
    });
    await assert.rejects(action(), { code: "ADMIN_SAFE_ROLE_FORBIDDEN" });
    assert.ok(h.attempts() >= 2);
    assert.equal(h.records.get("safe_locations/location-1").isDeleted, false);
    assert.equal(h.count("safe_locations"), 1);
    assert.equal(h.count("audit_logs"), 0);
  }
});

test("concurrent delete is idempotent with one deletion audit; edit cannot resurrect", async () => {
  h.seed();
  const results = await Promise.all([
    service.deleteSafeLocationForAdmin("admin", "location-1"),
    service.deleteSafeLocationForAdmin("admin2", "location-1"),
  ]);
  assert.equal(
    results.every((r) => r.deleted),
    true,
  );
  assert.equal(h.count("audit_logs"), 1);
  await assert.rejects(
    service.updateSafeLocationForAdmin("admin", "location-1", { name: "Lost" }),
    { code: "ADMIN_SAFE_LOCATION_NOT_FOUND" },
  );
});

test("edit/delete race always leaves a hidden tombstone and retained document", async () => {
  h.seed();
  const results = await Promise.allSettled([
    service.updateSafeLocationForAdmin("admin", "location-1", {
      name: "Changed",
    }),
    service.deleteSafeLocationForAdmin("admin2", "location-1"),
  ]);
  assert.equal(results[1].status, "fulfilled");
  assert.equal(h.records.get("safe_locations/location-1").isDeleted, true);
  await h.withApi(async (api) => {
    assert.deepEqual(
      (await api("/api/safe-locations", { actor: null })).body.data
        .safeLocations,
      [],
    );
  });
});

test("audit failure does not turn a committed business change into fake failure", async () => {
  h.seed();
  h.setFailAudit();
  const updated = await service.updateSafeLocationForAdmin(
    "admin",
    "location-1",
    { name: "Committed" },
  );
  assert.equal(updated.name, "Committed");
  const deleted = await service.deleteSafeLocationForAdmin(
    "admin",
    "location-1",
  );
  assert.equal(deleted.deleted, true);
  assert.equal(h.records.get("safe_locations/location-1").isDeleted, true);
});
