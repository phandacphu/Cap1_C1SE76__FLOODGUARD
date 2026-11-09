// Explicit opt-in, demo project only. Never reads .env or a service account.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const projectId = "demo-floodguard-safe-locations";
const enabled =
  process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
  process.env.GCLOUD_PROJECT === projectId;

test(
  "Firestore Emulator: catalogue HTTP CRUD, unbounded GPS order and concurrent soft delete",
  { skip: !enabled, timeout: 120000 },
  async () => {
    const { initializeApp, deleteApp } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");
    const express = require("express");
    const jwt = require("jsonwebtoken");
    const adminApp = initializeApp({ projectId }, `catalog-${randomUUID()}`);
    const db = getFirestore(adminApp);
    const firebasePath = require.resolve("../src/config/firebase");
    require.cache[firebasePath] = {
      id: firebasePath,
      filename: firebasePath,
      loaded: true,
      exports: { db },
    };
    process.env.JWT_SECRET = "safe-location-emulator-test-only";
    const {
      deleteSafeLocationForAdmin,
    } = require("../src/services/admin-safe-location.service");
    const suffix = randomUUID();
    const admin = `admin-${suffix}`,
      admin2 = `admin2-${suffix}`,
      rescue = `rescue-${suffix}`;
    const userIds = [admin, admin2, rescue];
    const pointIds = [];
    const serverApp = express();
    serverApp.use(express.json());
    serverApp.use(
      "/api/safe-locations",
      require("../src/routes/safe-location.routes"),
    );
    serverApp.use(
      "/api/admin/safe-locations",
      require("../src/routes/admin-safe-location.routes"),
    );
    const server = serverApp.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function api(path, method = "GET", body, actor = admin) {
      const headers = { "Content-Type": "application/json" };
      if (actor)
        headers.Authorization = `Bearer ${jwt.sign({ sub: actor, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m", algorithm: "HS256" })}`;
      const response = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }
    try {
      await Promise.all(
        userIds.map((id, index) =>
          db
            .collection("users")
            .doc(id)
            .set({ role: index === 2 ? "rescue" : "admin", isActive: true }),
        ),
      );
      for (const longitude of [0.01, 10]) {
        const result = await api("/api/admin/safe-locations", "POST", {
          name: `TEST ${suffix}`,
          address: "EMULATOR ONLY",
          location: { latitude: 0, longitude },
          type: "shelter",
        });
        assert.equal(result.status, 201);
        pointIds.push(result.body.data.safeLocation.id);
      }
      const list = await api(
        "/api/safe-locations?latitude=0&longitude=0",
        "GET",
        undefined,
        null,
      );
      assert.equal(list.status, 200);
      const selected = list.body.data.safeLocations.filter((point) =>
        pointIds.includes(point.id),
      );
      assert.deepEqual(
        selected.map((p) => p.id),
        pointIds,
      );
      assert.ok(selected[1].distanceKm > 1000);
      const id = pointIds[0];
      const before = (
        await db.collection("safe_locations").doc(id).get()
      ).data();
      const edited = await api(`/api/admin/safe-locations/${id}`, "PATCH", {
        name: "Updated TEST",
        location: { latitude: 0, longitude: 0 },
      });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.data.safeLocation.id, id);
      assert.equal(
        (await db.collection("safe_locations").doc(id).get())
          .data()
          .createdAt.toMillis(),
        before.createdAt.toMillis(),
      );
      assert.equal(
        (
          await api(
            `/api/admin/safe-locations/${id}`,
            "DELETE",
            undefined,
            rescue,
          )
        ).status,
        403,
      );
      const deleted = await Promise.all([
        deleteSafeLocationForAdmin(admin, id),
        deleteSafeLocationForAdmin(admin2, id),
      ]);
      assert.ok(deleted.every((item) => item.deleted));
      const tombstone = (
        await db.collection("safe_locations").doc(id).get()
      ).data();
      assert.equal(tombstone.isDeleted, true);
      assert.ok([admin, admin2].includes(tombstone.deletedBy));
      assert.ok(tombstone.deletedAt);
      assert.equal(
        (await api(`/api/safe-locations/${id}`, "GET", undefined, null)).status,
        404,
      );
      assert.equal(
        (
          await api(`/api/admin/safe-locations/${id}`, "PATCH", {
            name: "Must not resurrect",
          })
        ).status,
        404,
      );
      const finalList = await api(
        "/api/safe-locations",
        "GET",
        undefined,
        null,
      );
      assert.equal(
        finalList.body.data.safeLocations.some((point) => point.id === id),
        false,
      );
      assert.equal(
        finalList.body.data.safeLocations.some(
          (point) => point.id === pointIds[1],
        ),
        true,
      );
      const audit = await db
        .collection("audit_logs")
        .where("target.id", "==", id)
        .get();
      assert.equal(
        audit.docs.filter((doc) => doc.data().action === "safe_location.delete")
          .length,
        1,
      );
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      for (const id of pointIds) {
        const logs = await db
          .collection("audit_logs")
          .where("target.id", "==", id)
          .get();
        await Promise.all(logs.docs.map((doc) => doc.ref.delete()));
        await db.collection("safe_locations").doc(id).delete();
      }
      await Promise.all(
        userIds.map((id) => db.collection("users").doc(id).delete()),
      );
      await db.terminate();
      await deleteApp(adminApp);
    }
  },
);
