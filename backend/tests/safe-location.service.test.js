const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/safe-location-test-app");
const c = require("../src/services/safe-location-contract");
const service = require("../src/services/safe-location.service");
beforeEach(h.reset);

test("minimal fields accept every type and normalize optional description", () => {
  for (const type of c.SAFE_LOCATION_TYPES) {
    const data = c.normalizeSafeLocationData(
      h.body({ type, description: "  " }),
    );
    assert.equal(data.name, "TEST Shelter");
    assert.equal(data.address, "TEST Address");
    assert.equal(data.description, null);
    assert.equal(data.type, type);
    assert.deepEqual(
      Object.keys(data).sort(),
      ["name", "address", "location", "type", "description"].sort(),
    );
  }
  const data = h.body();
  delete data.description;
  assert.equal(c.normalizeSafeLocationData(data).description, null);
});

test("rejects obsolete/caller-controlled fields and malformed minimal input", () => {
  for (const key of [
    "capacity",
    "capacityNote",
    "services",
    "contactPhone",
    "status",
    "id",
    "isDeleted",
    "deletedAt",
    "deletedBy",
    "createdAt",
    "schemaVersion",
    "__proto__",
  ]) {
    const input = { ...h.body(), [key]: key === "__proto__" ? {} : "x" };
    assert.throws(() => c.normalizeSafeLocationData(input), {
      code: "INVALID_SAFE_LOCATION_DATA",
    });
  }
  for (const changes of [
    { name: " " },
    { address: null },
    { name: "x".repeat(201) },
    { address: "x".repeat(501) },
    { type: "unknown" },
    { description: 3 },
    { description: "x".repeat(2001) },
    { location: { latitude: "16", longitude: 108 } },
    { location: { latitude: NaN, longitude: 108 } },
    { location: { latitude: 91, longitude: 108 } },
    { location: { latitude: 16, longitude: Infinity } },
    { location: { latitude: 16, longitude: -181 } },
    { location: { latitude: 16 } },
    { location: { latitude: 0, longitude: 0, extra: true } },
  ]) {
    assert.throws(() => c.normalizeSafeLocationData(h.body(changes)), {
      code: "INVALID_SAFE_LOCATION_DATA",
    });
  }
  assert.deepEqual(
    c.normalizeSafeLocationData(
      h.body({ location: { latitude: 0, longitude: 0 } }),
    ).location,
    { latitude: 0, longitude: 0 },
  );
});

test("IDs are bounded document IDs, not paths or reserved IDs", () => {
  for (const value of [
    undefined,
    "",
    " ",
    ".",
    "..",
    "a/b",
    "__reserved__",
    "x".repeat(1501),
  ]) {
    assert.throws(() => c.normalizeSafeLocationId(value), {
      code: "INVALID_SAFE_LOCATION_ID",
    });
  }
});

test("fixture writes keep ID and creation time without resurrecting deleted records", async () => {
  const created = await service.createSafeLocation(h.body());
  assert.equal(created.schemaVersion, 2);
  assert.equal(created.isDeleted, false);
  const before = await service.setSafeLocationById("fixture", h.body());
  const after = await service.setSafeLocationById(
    "fixture",
    h.body({ name: "Updated" }),
  );
  assert.equal(after.id, "fixture");
  assert.equal(after.createdAt.toMillis(), before.createdAt.toMillis());
  h.records.get("safe_locations/fixture").isDeleted = true;
  await assert.rejects(service.setSafeLocationById("fixture", h.body()), {
    code: "SAFE_LOCATION_NOT_FOUND",
  });
  assert.equal(await service.getSafeLocationById("fixture"), null);
});

test("legacy service documents stay separate and cannot be linked to a deleted point", async () => {
  h.seed();
  const saved = await service.setSafeLocationServiceById("water", {
    safeLocationId: "location-1",
    name: "water",
    isAvailable: true,
  });
  assert.equal(saved.safeLocationId, "location-1");
  assert.equal(
    (await service.getSafeLocationServiceById("water")).name,
    "water",
  );
  h.records.get("safe_locations/location-1").isDeleted = true;
  await assert.rejects(
    service.setSafeLocationServiceById("new", {
      safeLocationId: "location-1",
      name: "water",
      isAvailable: true,
    }),
  );
});
