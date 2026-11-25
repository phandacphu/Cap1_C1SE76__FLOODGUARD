// Explicit opt-in: npm --prefix backend ci; node --test web/tests/rescueWarningV2.backend-integration.cjs
// Real V2 HTTP router, JWT verification, service and geometry normalizer; isolated in-memory DB.
// No credentials, Render, Firestore connection, emulator, Admin HTTP writes, worker or FCM.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { randomUUID, randomBytes } = require("node:crypto");
const backend = createRequire(
  require("node:path").resolve(__dirname, "../../backend/package.json"),
);
const express = backend("express"),
  jwt = backend("jsonwebtoken");
const {
  createTestDb,
} = require("../../backend/tests/helpers/warning-v2-test-db");
const {
  createFloodWarningV2Service,
} = require("../../backend/src/services/flood-warning-v2.service");
const {
  createWarningZonesService,
} = require("../../backend/src/services/warning-v2-zones.service");
const {
  createFloodWarningV2Router,
} = require("../../backend/src/routes/flood-warning-v2-router");
const { loader } = require("./helpers/rescue-warning-loader.cjs");
const { createRescueWarningApi } = loader()(
  "pages/rescue/warnings/warningApi.ts",
);

test(
  "Rescue Web adapter integrates with production V2 HTTP/JWT/router/service using isolated DB",
  { timeout: 30_000 },
  async (t) => {
    const env = createTestDb(),
      secret = randomBytes(32).toString("hex");
    let radarUnavailable = false;
    const square = {
      type: "Polygon",
      coordinates: [
        [
          [108.2, 16.05],
          [108.21, 16.05],
          [108.21, 16.06],
          [108.2, 16.06],
          [108.2, 16.05],
        ],
      ],
    };
    const zonesService = createWarningZonesService({
      db: env.db,
      loadLayer: async (kind) => {
        if (kind === "radar" && radarUnavailable)
          throw new Error("TEST source unavailable");
        return {
          type: "FeatureCollection",
          features:
            kind === "radar"
              ? [
                  {
                    type: "Feature",
                    properties: { name: "TEST Radar" },
                    geometry: square,
                  },
                ]
              : [
                  {
                    type: "Feature",
                    properties: {
                      id: "HIST-TEST",
                      name: "TEST History without outline",
                    },
                    geometry: { type: "Point", coordinates: [108.205, 16.055] },
                  },
                ],
        };
      },
    });
    const service = createFloodWarningV2Service({ db: env.db, zonesService });
    env.put("flood_areas/TEST-FLOOD", {
      name: "TEST Current",
      areaType: "flood",
      geometry: square,
    });
    env.put("flood_areas/TEST-LOW", {
      name: "TEST Admin Low",
      areaType: "low_lying",
      geometry: square,
    });
    const first = (
      await service.create("admin", randomUUID(), {
        title: "TEST ONLY Rain A",
        content: "Rescue Web isolated test",
      })
    ).floodAlert;
    const second = (
      await service.create("admin", randomUUID(), {
        title: "TEST ONLY Rain B",
        content: "Rescue Web isolated test",
      })
    ).floodAlert;
    const old = (
      await service.create("admin", randomUUID(), {
        title: "TEST ONLY History",
        content: "Inactive bulletin",
      })
    ).floodAlert;
    await service.deactivate("admin", old.id, {});
    const app = express();
    app.use(express.json());
    app.use(
      "/api/flood-alerts",
      createFloodWarningV2Router({ service, secret: () => secret }),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const token = jwt.sign({ sub: "rescue", role: "rescue" }, secret, {
      algorithm: "HS256",
      expiresIn: "5m",
    });
    const api = createRescueWarningApi(token, base, fetch),
      signal = new AbortController().signal;
    t.diagnostic(
      `Local base URL: ${base}; source HEAD recorded in handoff. Storage: in-memory test double, not Firestore/Emulator.`,
    );
    try {
      await t.test(
        "list/all, active alias, filters/status/q and exact detail",
        async () => {
          assert.equal((await api.list(signal)).length, 3);
          assert.equal((await api.active(signal)).length, 2);
          assert.equal(
            (await api.list(signal, { status: "active" })).length,
            2,
          );
          assert.equal(
            (await api.list(signal, { status: "inactive" }))[0].id,
            old.id,
          );
          assert.equal(
            (await api.list(signal, { q: "Rain B" }))[0].id,
            second.id,
          );
          assert.equal((await api.list(signal, { q: "no match" })).length, 0);
          assert.equal((await api.detail(first.id, signal)).endAt, null);
          assert.ok((await api.detail(old.id, signal)).endAt);
          await assert.rejects(
            api.detail("NOT-FOUND", signal),
            (error) => error.status === 404,
          );
        },
      );
      await t.test(
        "zones preserve radar/Admin low-lying and missing historical geometry; partial stays partial",
        async () => {
          const bundle = await api.zones(signal);
          assert.equal(bundle.coverage.status, "partial");
          assert.equal(bundle.coverage.totalZones, 4);
          assert.equal(bundle.coverage.evaluableZones, 3);
          assert.equal(
            bundle.geojson.features.find(
              (f) => f.properties.sourceKind === "historical_area",
            ).geometry,
            null,
          );
          assert.deepEqual(
            Array.from(
              bundle.geojson.features.filter(
                (f) => f.properties.group === "low_lying",
              ),
              (f) => f.properties.sourceKind,
            ).sort(),
            ["admin_area", "radar"],
          );
          radarUnavailable = true;
          const partial = await api.zones(signal);
          assert.equal(partial.coverage.status, "partial");
          assert.ok(
            partial.coverage.unassessableZones.some(
              (x) =>
                x.sourceKind === "radar" && x.reason === "source_unavailable",
            ),
          );
          radarUnavailable = false;
        },
      );
      await t.test(
        "current DB account/role rules and invalid JWT are enforced",
        async () => {
          await assert.rejects(
            createRescueWarningApi("invalid", base, fetch).list(signal),
            (error) => error.status === 401,
          );
          env.put("users/rescue", { role: "rescue", isActive: false });
          await assert.rejects(
            api.active(signal),
            (error) =>
              error.status === 403 && error.code === "ACCOUNT_INACTIVE",
          );
          env.put("users/rescue", { role: "unknown-role", isActive: true });
          await assert.rejects(
            api.list(signal),
            (error) => error.status === 403,
          );
          env.put("users/rescue", { role: "rescue", isActive: true });
        },
      );
      await t.test(
        "server error is not empty; refresh observes a deactivated bulletin",
        async () => {
          env.failReads();
          await assert.rejects(
            api.list(signal),
            (error) => error.status === 500,
          );
          env.failReads(false);
          await service.deactivate("admin", first.id, {});
          assert.equal((await api.active(signal)).length, 1);
          assert.equal((await api.detail(first.id, signal)).status, "inactive");
          assert.equal(
            (await api.list(signal, { status: "inactive" })).length,
            2,
          );
        },
      );
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await assert.rejects(
      api.list(signal),
      (error) => error.status === 0 && error.code === "NETWORK_ERROR",
    );
  },
);
