const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/safe-location-test-app");
beforeEach(h.reset);

test("public catalogue is minimal, excludes deleted/inactive/invalid legacy records and never reads services", async () => {
  h.seed("valid", {
    status: "active",
    schemaVersion: undefined,
    capacity: 100,
    services: ["secret"],
    contactPhone: "private",
    id: "forged",
  });
  h.seed("deleted", { isDeleted: true });
  h.seed("deleted-time", { deletedAt: h.Timestamp.now() });
  h.seed("inactive-old", { schemaVersion: undefined, status: "inactive" });
  h.seed("unknown-old", { schemaVersion: undefined, status: "unexpected" });
  h.seed("bad", { location: { latitude: 91, longitude: 0 } });
  await h.withApi(async (api) => {
    const response = await api("/api/safe-locations", { actor: null });
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.data.safeLocations.map((p) => p.id),
      ["valid"],
    );
    const point = response.body.data.safeLocations[0];
    assert.equal(point.distanceKm, null);
    assert.deepEqual(
      Object.keys(point).sort(),
      [
        "id",
        "name",
        "address",
        "location",
        "type",
        "description",
        "distanceKm",
      ].sort(),
    );
  });
});

test("public detail uses the same ID/data and optional GPS distance; no fake distance without GPS", async () => {
  h.seed();
  await h.withApi(async (api) => {
    const point = (await api("/api/safe-locations/location-1", { actor: null }))
      .body.data.safeLocation;
    const list = (await api("/api/safe-locations", { actor: null })).body.data
      .safeLocations;
    assert.deepEqual(point, list[0]);
    assert.equal(point.distanceKm, null);
    const located = await api(
      "/api/safe-locations/location-1?latitude=16.0544&longitude=108.2022",
      { actor: null },
    );
    assert.equal(located.status, 200);
    assert.equal(located.body.data.safeLocation.distanceKm, 0);
  });
});

test("missing/deleted IDs are 404 and invalid IDs/queries are 400", async () => {
  h.seed("deleted", { isDeleted: true });
  await h.withApi(async (api) => {
    for (const id of ["missing", "deleted"]) {
      const result = await api(`/api/safe-locations/${id}`, { actor: null });
      assert.equal(result.status, 404);
      assert.equal(result.body.message, "Địa điểm không còn được cung cấp");
    }
    for (const path of [
      "/api/safe-locations/a%2Fb",
      "/api/safe-locations/__reserved__",
      "/api/safe-locations?latitude=1",
      "/api/safe-locations?latitude=0&latitude=1&longitude=0",
      "/api/safe-locations/missing?status=active",
    ]) {
      assert.equal((await api(path, { actor: null })).status, 400);
    }
  });
});

test("empty is 200 with [], database failure is 500 without raw internals", async () => {
  await h.withApi(async (api) => {
    assert.deepEqual(
      (await api("/api/safe-locations", { actor: null })).body.data
        .safeLocations,
      [],
    );
    h.setFailRead();
    const response = await api("/api/safe-locations", { actor: null });
    assert.equal(response.status, 500);
    assert.equal(response.body.success, false);
    assert.equal(JSON.stringify(response.body).includes("secret"), false);
    assert.equal(response.body.data, undefined);
  });
});
