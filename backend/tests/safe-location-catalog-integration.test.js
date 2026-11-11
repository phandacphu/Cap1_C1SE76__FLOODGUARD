const { test } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/safe-location-test-app");
test("HTTP Admin create -> Resident/Rescue read -> GPS order -> edit -> soft delete -> detail unavailable", async () => {
  h.reset();
  await h.withApi(async (api) => {
    const created = await api("/api/admin/safe-locations", {
      method: "POST",
      body: h.body(),
    });
    assert.equal(created.status, 201);
    const id = created.body.data.safeLocation.id;
    for (const actor of ["resident", "rescue"]) {
      const list = await api("/api/safe-locations?latitude=16&longitude=108", {
        actor,
      });
      assert.equal(list.status, 200);
      assert.equal(list.body.data.safeLocations[0].id, id);
      const detail = await api(
        `/api/safe-locations/${id}?latitude=16&longitude=108`,
        { actor },
      );
      assert.deepEqual(
        detail.body.data.safeLocation,
        list.body.data.safeLocations[0],
      );
      assert.equal(
        (
          await api(`/api/admin/safe-locations/${id}`, {
            actor,
            method: "DELETE",
          })
        ).status,
        403,
      );
    }
    const updated = await api(`/api/admin/safe-locations/${id}`, {
      method: "PATCH",
      body: { name: "Updated point", location: { latitude: 0, longitude: 0 } },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.safeLocation.id, id);
    assert.equal(
      (await api(`/api/safe-locations/${id}?latitude=0&longitude=0`)).body.data
        .safeLocation.distanceKm,
      0,
    );
    assert.equal(
      (await api(`/api/admin/safe-locations/${id}`, { method: "DELETE" }))
        .status,
      200,
    );
    assert.equal((await api(`/api/safe-locations/${id}`)).status, 404);
    assert.deepEqual(
      (await api("/api/safe-locations?latitude=0&longitude=0")).body.data
        .safeLocations,
      [],
    );
    assert.equal(h.records.has(`safe_locations/${id}`), true);
    assert.deepEqual(
      [...h.records.values()].filter((r) => r.action).map((r) => r.action),
      ["safe_location.create", "safe_location.update", "safe_location.delete"],
    );
  });
});
