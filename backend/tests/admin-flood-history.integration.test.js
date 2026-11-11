const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const jwt = require("jsonwebtoken");

const jwtSecret = "admin-flood-history-local-test";
process.env.JWT_SECRET = jwtSecret;

const records = new Map([
  ["users/admin", { role: "admin", isActive: true }],
  ["users/inactive", { role: "admin", isActive: false }],
  ["users/former-admin", { role: "rescue", isActive: true }],
]);
const auditEvents = [];

function collection(name) {
  return {
    doc(id) {
      const key = `${name}/${id}`;
      return {
        key,
        async get() {
          return { exists: records.has(key), data: () => records.get(key) };
        },
      };
    },
    async get() {
      const prefix = `${name}/`;
      return {
        docs: [...records].filter(([key]) => key.startsWith(prefix))
          .map(([key, data]) => ({ id: key.slice(prefix.length), data: () => data })),
      };
    },
  };
}

const mockDb = {
  collection,
  async runTransaction(operation) {
    const writes = [];
    const result = await operation({
      get: (ref) => ref.get(),
      set(ref, data, options) {
        writes.push(() => {
          const current = options?.merge ? records.get(ref.key) : {};
          records.set(ref.key, { ...current, ...data });
        });
      },
    });
    for (const write of writes) write();
    return result;
  },
};

// Use real Firestore only when explicitly pointed at the local demo emulator.
const projectId = "demo-floodguard-flood-history";
const emulatorApp = process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
  process.env.GCLOUD_PROJECT === projectId ? initializeApp({ projectId }) : null;
const db = emulatorApp ? getFirestore(emulatorApp) : mockDb;

if (emulatorApp) {
  before(async () => {
    await Promise.all([...records].map(([path, data]) => db.doc(path).set(data)));
  });
  after(async () => {
    try {
      await Promise.all([
        ...[...records.keys()].map((path) => db.doc(path).delete()),
        db.collection("historical_flood_area_overrides").doc("HIST-02").delete(),
      ]);
    } finally {
      await db.terminate();
      await deleteApp(emulatorApp);
    }
  });
}

const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
const auditPath = require.resolve("../src/services/audit-logging.service");
require.cache[auditPath] = {
  id: auditPath, filename: auditPath, loaded: true,
  exports: { logAuditEvent: async (event) => auditEvents.push(event) },
};

const app = require("../src/app");

const databaseMode = emulatorApp ? "Firestore Emulator" : "Firestore mock";
test(`Historical polygon edit and soft delete via HTTP (${databaseMode})`, async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  async function api(path, { actor, role = "admin", method = "GET", body } = {}) {
    const headers = {};
    if (actor) {
      headers.Authorization = `Bearer ${jwt.sign({ sub: actor, role }, jwtSecret, { algorithm: "HS256" })}`;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  const admin = { actor: "admin" };
  const catalog = "/admin/flood-history";
  const id = "HIST-02";
  const path = `${catalog}/${id}`;
  const geometry = {
    type: "polygon",
    points: [
      { latitude: 16.08, longitude: 108.13 },
      { latitude: 16.08, longitude: 108.14 },
      { latitude: 16.09, longitude: 108.13 },
    ],
  };
  const edit = {
    name: "Vùng lịch sử kiểm thử", description: "Đa giác do Admin vẽ",
    areaType: "low_lying", source: "Nguồn kiểm thử", geometry,
  };

  try {
    assert.equal((await api(catalog)).status, 401);
    assert.equal((await api(catalog, { actor: "former-admin", role: "rescue" })).status, 403);
    assert.equal((await api(catalog, { actor: "inactive" })).status, 403);
    assert.equal((await api(catalog, { actor: "former-admin" })).status, 403);
    const list = await api(catalog, admin);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.floodAreas.length, 27);
    const original = (await api(path, admin)).body.data.floodArea;
    assert.equal(original.geometry, null);
    assert.equal(original.areaType, null);
    assert.equal(original.source, null);

    assert.equal((await api(path, { ...admin, method: "PATCH", body: { name: edit.name } })).status, 400);
    assert.equal((await api(path, { ...admin, method: "PATCH", body: { ...edit, id: "HIST-03" } })).status, 400);
    const invalidGeometry = { ...geometry, points: Array(3).fill(geometry.points[0]) };
    assert.equal((await api(path, { ...admin, method: "PATCH", body: { ...edit, geometry: invalidGeometry } })).status, 400);
    const collinear = {
      ...geometry,
      points: [108.13, 108.14, 108.15].map((longitude) => ({ latitude: 16.08, longitude })),
    };
    assert.equal((await api(path, { ...admin, method: "PATCH", body: { ...edit, geometry: collinear } })).status, 400);
    assert.equal((await api(path, { actor: "inactive", method: "PATCH", body: edit })).status, 403);
    assert.equal((await api(path, { actor: "former-admin", method: "DELETE" })).status, 403);

    const patched = await api(path, { ...admin, method: "PATCH", body: edit });
    assert.equal(patched.status, 200);
    const saved = patched.body.data.floodArea;
    assert.deepEqual(saved, { ...original, ...edit, updatedAt: saved.updatedAt });
    assert.ok(Date.parse(saved.updatedAt));
    assert.deepEqual((await api(path, admin)).body.data.floodArea, saved);
    assert.equal(auditEvents.at(-1).action, "historical_flood_area.update");

    const renamed = await api(path, { ...admin, method: "PATCH", body: { name: "Tên mới" } });
    assert.equal(renamed.status, 200);
    assert.deepEqual(renamed.body.data.floodArea.geometry, geometry);
    assert.equal(renamed.body.data.floodArea.name, "Tên mới");

    const points = (await api("/flood-history/points")).body.data.geojson.features;
    const point = points.find((feature) => feature.properties.id === id);
    assert.deepEqual(point.geometry, {
      type: "Point", coordinates: [original.referencePoint.longitude, original.referencePoint.latitude],
    });
    assert.equal(point.properties.name, "Tên mới");
    const areas = (await api("/flood-history/areas")).body.data.geojson.features;
    assert.equal(areas.length, 1);
    assert.equal(areas[0].properties.id, id);
    assert.equal(areas[0].properties.areaType, "low_lying");
    assert.equal(areas[0].properties.current_flood_alert, false);
    assert.deepEqual(areas[0].geometry, {
      type: "Polygon", coordinates: [[[108.13, 16.08], [108.14, 16.08], [108.13, 16.09], [108.13, 16.08]]],
    });

    const removed = await api(path, { ...admin, method: "DELETE" });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.deleted, true);
    assert.equal((await api(path, admin)).status, 404);
    assert.equal((await api(path, { ...admin, method: "PATCH", body: edit })).status, 404);
    assert.deepEqual((await api(path, { ...admin, method: "DELETE" })).body.data, removed.body.data);
    assert.equal(auditEvents.filter((event) => event.action === "historical_flood_area.delete").length, 1);
    assert.equal((await api(catalog, admin)).body.data.floodAreas.some((area) => area.id === id), false);
    for (const layer of ["points", "areas"]) {
      const result = await api(`/flood-history/${layer}`);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.geojson.features.some((feature) => feature.properties.id === id), false);
    }
    assert.equal((await api("/flood-history/buffers")).body.data.geojson.features.length, 2);
    assert.equal((await api("/flood-history/radar")).body.data.geojson.features.length, 157);
    assert.equal((await api(`${catalog}/HIST-999`, { ...admin, method: "DELETE" })).status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
