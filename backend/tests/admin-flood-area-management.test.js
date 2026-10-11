const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const {
  Timestamp,
  FieldValue,
} = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf113-local-test-secret-only";

const originalTime = Timestamp.fromDate(
  new Date("2026-10-11T10:00:00.000Z"),
);

const fixedTime = Timestamp.fromDate(
  new Date("2026-10-11T11:00:00.000Z"),
);

const records = new Map();
const versions = new Map();
const collectionVersions = new Map();
const auditEvents = [];

let sequence = 0;
let failCommit = false;
let failAudit = false;
let retryCount = 0;

let beforeCommitHook = null;

function createCommitBarrier() {
  let arrivals = 0;
  let release;

  const ready = new Promise((resolve) => {
    release = resolve;
  });

  return async function waitForTwoTransactions() {
    // Only synchronize the first two attempts.
    // Retried attempts must proceed normally.
    if (arrivals >= 2) {
      return;
    }

    arrivals++;

    if (arrivals === 2) {
      release();
    }

    await ready;
  };
}

function save(key, data) {
  records.set(key, { ...data });
  bumpVersion(key);
}

function bumpVersion(key) {
  versions.set(key, (versions.get(key) || 0) + 1);

  const collection = key.split("/")[0];

  collectionVersions.set(
    collection,
    (collectionVersions.get(collection) || 0) + 1,
  );
}

function snapshot(ref) {
  const data = records.get(ref.key);

  return {
    id: ref.id,
    exists: data !== undefined,
    data: () => (
      data === undefined ? undefined : { ...data }
    ),
  };
}

function resolveTimestamps(data) {
  const saved = { ...data };
  const sentinel = FieldValue.serverTimestamp();

  for (const field of ["createdAt", "updatedAt"]) {
    if (
      saved[field] &&
      !(saved[field] instanceof Timestamp) &&
      typeof saved[field].isEqual === "function" &&
      saved[field].isEqual(sentinel)
    ) {
      saved[field] = fixedTime;
    }
  }

  return saved;
}

function documentRef(collectionName, id) {
  const ref = {
    id,
    key: `${collectionName}/${id}`,
    collectionName,
  };

  ref.get = async () => snapshot(ref);

  return ref;
}

function queryRef(collectionName, filters = [], max = Infinity) {
  return {
    collectionName,
    isQuery: true,

    where(field, operator, value) {
      assert.equal(operator, "==");

      return queryRef(
        collectionName,
        [...filters, [field, value]],
        max,
      );
    },

    limit(value) {
      return queryRef(collectionName, filters, value);
    },

    async get() {
      const prefix = `${collectionName}/`;

      const docs = [...records.entries()]
        .filter(([key, data]) =>
          key.startsWith(prefix) &&
          filters.every(([field, value]) =>
            data[field] === value,
          ),
        )
        .slice(0, max)
        .map(([key]) => snapshot(
          documentRef(
            collectionName,
            key.slice(prefix.length),
          ),
        ));

      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
      };
    },
  };
}

const db = {
  collection(collectionName) {
    const query = queryRef(collectionName);

    return {
      ...query,

      doc(id = `generated-${++sequence}`) {
        return documentRef(collectionName, id);
      },
    };
  },

  async runTransaction(callback) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const reads = new Map();
      const queryReads = new Map();
      const writes = [];
      let writesStarted = false;

      const transaction = {
        async get(ref) {
          assert.equal(
            writesStarted,
            false,
            "All transaction reads must precede writes",
          );

          if (ref.isQuery) {
            queryReads.set(
              ref.collectionName,
              collectionVersions.get(ref.collectionName) || 0,
            );

            return ref.get();
          }

          reads.set(
            ref.key,
            versions.get(ref.key) || 0,
          );

          return snapshot(ref);
        },

        create(ref, data) {
          writesStarted = true;
          writes.push({ type: "create", ref, data });
          return this;
        },

        update(ref, data) {
          writesStarted = true;
          writes.push({ type: "update", ref, data });
          return this;
        },

        set(ref, data) {
          writesStarted = true;
          writes.push({ type: "set", ref, data });
          return this;
        },

        delete(ref) {
          writesStarted = true;
          writes.push({ type: "delete", ref });
          return this;
        },
      };

      const result = await callback(transaction);

      if (beforeCommitHook) {
        await beforeCommitHook();
      }

      const conflict =
        [...reads.entries()].some(([key, version]) =>
          (versions.get(key) || 0) !== version,
        ) ||
        [...queryReads.entries()].some(([name, version]) =>
          (collectionVersions.get(name) || 0) !== version,
        );

      if (conflict) {
        retryCount++;
        continue;
      }

      if (failCommit) {
        throw new Error("Simulated commit failure");
      }

      // Validate all operations before committing any of them.
      for (const { type, ref } of writes) {
        if (type === "create") {
          assert.equal(records.has(ref.key), false);
        }

        if (type === "update" || type === "delete") {
          assert.equal(records.has(ref.key), true);
        }
      }

      for (const { type, ref, data } of writes) {
        if (type === "delete") {
          records.delete(ref.key);
          bumpVersion(ref.key);
          continue;
        }

        const resolved = resolveTimestamps(data);

        save(
          ref.key,
          type === "update"
            ? { ...records.get(ref.key), ...resolved }
            : resolved,
        );
      }

      return result;
    }

    throw new Error("Simulated retry limit reached");
  },
};

const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

// Use the actual audit validator to check geometry/source fields.
const {
  normalizeAuditLogData,
} = require("../src/services/audit-log.service");

const auditPath = require.resolve(
  "../src/services/audit-logging.service",
);

require.cache[auditPath] = {
  id: auditPath,
  filename: auditPath,
  loaded: true,
  exports: {
    async logAuditEvent(event) {
      const normalized = normalizeAuditLogData(event);
      const key = `flood_areas/${event.target.id}`;

      if (event.action === "flood_area.delete") {
        assert.equal(records.has(key), false);
      } else {
        assert.equal(
          records.get(key).updatedAt,
          fixedTime,
          "Audit must execute after commit",
        );
      }

      auditEvents.push(normalized);

      return failAudit
        ? { success: false, code: "AUDIT_WRITE_FAILED" }
        : { success: true, id: "test-audit" };
    },
  },
};

const {
  normalizeFloodAreaData,
} = require("../src/services/flood-area.service");

const {
  createFloodAreaForAdmin,
  updateFloodAreaForAdmin,
  deleteFloodAreaForAdmin,
} = require("../src/services/admin-flood-area.service");

const {
  createFloodAlert,
  setFloodAlertById,
} = require("../src/services/flood-alert.service");

const adminRoutes = require(
  "../src/routes/admin-flood-area.routes",
);

const publicRoutes = require(
  "../src/routes/flood-area.routes",
);

const app = express();
app.use(express.json());
app.use("/api/admin/flood-areas", adminRoutes);
app.use("/api/flood-areas", publicRoutes);

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body",
    });
  }

  return next(error);
});

function sampleArea() {
  return {
    name: "TEST ONLY flood area",
    description: "Simulated flood area",
    geometry: {
      type: "polygon",
      points: [
        { latitude: 16.05, longitude: 108.20 },
        { latitude: 16.06, longitude: 108.21 },
        { latitude: 16.04, longitude: 108.22 },
      ],
    },
    severity: "low",
    status: "inactive",
    source: "test",
  };
}

function sampleAlert(areaId = "area-1") {
  return {
    title: "TEST ONLY warning",
    content: "Simulated warning",
    severity: "low",
    status: "inactive",
    areaId,
    startAt: "2026-10-11T10:00:00.000Z",
    endAt: "2026-10-11T12:00:00.000Z",
  };
}

function reset() {
  records.clear();
  versions.clear();
  collectionVersions.clear();
  auditEvents.length = 0;
  sequence = 0;
  failCommit = false;
  failAudit = false;
  retryCount = 0;
  beforeCommitHook = null;

  for (const [id, role, isActive] of [
    ["admin", "admin", true],
    ["resident", "resident", true],
    ["rescue", "rescue", true],
    ["inactive-admin", "admin", false],
  ]) {
    save(`users/${id}`, { role, isActive });
  }

  save("flood_areas/area-1", {
    ...sampleArea(),
    createdAt: originalTime,
    updatedAt: originalTime,
    internalField: "preserve-me",
  });
}

function tokenFor(id, role = "admin", expiresIn = "5m") {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn },
  );
}

function assertPublicArea(area) {
  assert.deepEqual(Object.keys(area).sort(), [
    "id",
    "name",
    "description",
    "geometry",
    "severity",
    "status",
    "source",
    "createdAt",
    "updatedAt",
  ].sort());
}

async function runTests() {
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const origin = `http://127.0.0.1:${server.address().port}`;
    const baseUrl = `${origin}/api/admin/flood-areas`;

    async function request(method, path, token, body) {
      const headers = {};

      if (token !== undefined) {
        headers.Authorization = `Bearer ${token}`;
      }

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined
          ? undefined
          : JSON.stringify(body),
      });

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    async function expectRejected(
      method, path, token, status, body,
    ) {
      const before = [...records.entries()];
      const auditCount = auditEvents.length;

      const result = await request(method, path, token, body);

      assert.equal(result.status, status);
      assert.equal(result.body.success, false);
      assert.deepEqual([...records.entries()], before);
      assert.equal(auditEvents.length, auditCount);
    }

    reset();
    const adminToken = tokenFor("admin");

    // Authentication and authorization on all five endpoints.
    for (const [method, path, body] of [
      ["GET", "", undefined],
      ["GET", "/area-1", undefined],
      ["POST", "", sampleArea()],
      ["PATCH", "/area-1", { severity: "high" }],
      ["DELETE", "/area-1", undefined],
    ]) {
      await expectRejected(method, path, undefined, 401, body);
      await expectRejected(method, path, "bad-token", 401, body);
      await expectRejected(
        method, path, tokenFor("admin", "admin", -1), 401, body,
      );

      for (const id of ["resident", "rescue"]) {
        await expectRejected(
          method, path, tokenFor(id, id), 403, body,
        );
        await expectRejected(
          method, path, tokenFor(id), 403, body,
        );
      }

      await expectRejected(
        method, path, tokenFor("inactive-admin"), 403, body,
      );
      await expectRejected(
        method, path, tokenFor("deleted-admin"), 401, body,
      );
    }

    // Existing public read API remains available without a token.
    const publicResponse = await fetch(
      `${origin}/api/flood-areas`,
    );
    const publicBody = await publicResponse.json();

    assert.equal(publicResponse.status, 200);
    assert.equal(publicBody.data.floodAreas.length, 1);
    assert.equal(
      publicBody.data.floodAreas[0].createdAt,
      undefined,
    );

    const list = await request("GET", "", adminToken);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.floodAreas.length, 1);
    assertPublicArea(list.body.data.floodAreas[0]);

    const detail = await request(
      "GET", "/area-1", adminToken,
    );

    assert.equal(detail.status, 200);
    assertPublicArea(detail.body.data.floodArea);
    assert.equal(auditEvents.length, 0);

    for (const method of ["GET", "PATCH", "DELETE"]) {
      await expectRejected(
        method, "/missing", adminToken, 404,
        method === "PATCH" ? { status: "inactive" } : undefined,
      );

      await expectRejected(
        method, "/bad%2Fid", adminToken, 400,
        method === "PATCH" ? { status: "inactive" } : undefined,
      );
    }

    // Direct validation covers values JSON cannot represent.
    for (const value of [NaN, Infinity, -Infinity]) {
      for (const field of ["latitude", "longitude"]) {
        const area = sampleArea();
        area.geometry.points[0][field] = value;

        assert.throws(
          () => normalizeFloodAreaData(area),
          /numeric latitude and longitude/,
        );
      }
    }

    const invalidBodies = [
      {},
      [],
      null,
      { ...sampleArea(), name: "   " },
      { ...sampleArea(), description: 123 },
      { ...sampleArea(), severity: "unknown" },
      { ...sampleArea(), status: "unknown" },
      { ...sampleArea(), source: "" },
      { ...sampleArea(), geometry: null },
      {
        ...sampleArea(),
        geometry: { type: "polygon", points: [] },
      },
      {
        ...sampleArea(),
        geometry: {
          type: "point",
          points: sampleArea().geometry.points,
        },
      },
      { ...sampleArea(), createdAt: "client-time" },
      { ...sampleArea(), actorId: "other-admin" },
    ];

    for (const body of invalidBodies) {
      await expectRejected("POST", "", adminToken, 400, body);
    }

    for (const [field, value] of [
      ["latitude", 91],
      ["latitude", -91],
      ["longitude", 181],
      ["longitude", -181],
      ["latitude", "16.05"],
      ["longitude", null],
    ]) {
      const area = sampleArea();
      area.geometry.points[0][field] = value;

      await expectRejected(
        "POST", "", adminToken, 400, area,
      );
    }

    const extraPoint = sampleArea();
    extraPoint.geometry.points[0].secret = "unsupported";

    await expectRejected(
      "POST", "", adminToken, 400, extraPoint,
    );

    for (const body of [
      {},
      { severity: "invalid" },
      { name: "" },
      { source: null },
      { location: { latitude: 16, longitude: 108 } },
      { updatedAt: "client-time" },
    ]) {
      await expectRejected(
        "PATCH", "/area-1", adminToken, 400, body,
      );
    }

    await expectRejected(
      "DELETE", "/area-1", adminToken, 400,
      { force: true },
    );

    // Create and normalize whitespace.
    const createBody = sampleArea();
    createBody.name = "  TEST ONLY new area  ";
    createBody.description = "   ";

    const created = await request(
      "POST", "", adminToken, createBody,
    );

    assert.equal(created.status, 201);

    const createdArea = created.body.data.floodArea;
    const createdId = createdArea.id;

    assertPublicArea(createdArea);
    assert.equal(createdArea.name, "TEST ONLY new area");
    assert.equal(createdArea.description, null);
    assert.equal(
      createdArea.createdAt,
      fixedTime.toDate().toISOString(),
    );

    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, "flood_area.create");
    assert.equal(auditEvents[0].actor.id, "admin");
    assert.equal(auditEvents[0].target.id, createdId);
    assert.ok(
      auditEvents[0].metadata.changedFields.includes("geometry"),
    );
    assert.ok(
      auditEvents[0].metadata.changedFields.includes("source"),
    );

    // Partial update preserves original timestamp and internal data.
    const updated = await request(
      "PATCH", "/area-1", adminToken,
      { severity: "high", source: "  admin test  " },
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.floodArea.severity, "high");
    assert.equal(updated.body.data.floodArea.source, "admin test");

    const savedArea = records.get("flood_areas/area-1");

    assert.equal(savedArea.createdAt, originalTime);
    assert.equal(savedArea.internalField, "preserve-me");
    assert.equal(savedArea.updatedAt, fixedTime);
    assert.deepEqual(
      auditEvents[1].metadata.changedFields,
      ["severity", "source"],
    );

    // Repeating the same normalized values creates no extra audit.
    const repeated = await request(
      "PATCH", "/area-1", adminToken,
      { severity: "high", source: "admin test" },
    );

    assert.equal(repeated.status, 200);
    assert.equal(auditEvents.length, 2);

    // Geometry updates must be recorded accurately.
    const geometry = sampleArea().geometry;
    geometry.points[0].latitude = 16.07;

    const geometryUpdate = await request(
      "PATCH", "/area-1", adminToken, { geometry },
    );

    assert.equal(geometryUpdate.status, 200);
    assert.deepEqual(
      auditEvents[2].metadata.changedFields,
      ["geometry"],
    );

    // Delete an unreferenced area.
    const deleted = await request(
      "DELETE", `/${createdId}`, adminToken,
    );

    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.data.id, createdId);
    assert.equal(records.has(`flood_areas/${createdId}`), false);
    assert.equal(auditEvents[3].action, "flood_area.delete");

    // Any linked alert blocks deletion, including inactive alerts.
    save("flood_alerts/linked-alert", {
      areaId: "area-1",
      status: "inactive",
    });

    await expectRejected(
      "DELETE", "/area-1", adminToken, 409,
    );

    // Transaction failures must not save changes or emit audit.
    for (const [method, path, body] of [
      ["POST", "", sampleArea()],
      ["PATCH", "/area-1", { severity: "critical" }],
      ["DELETE", "/area-1", undefined],
    ]) {
      reset();
      failCommit = true;

      const originalConsoleError = console.error;
      console.error = () => {};

      try {
        await expectRejected(
          method, path, adminToken, 500, body,
        );
      } finally {
        console.error = originalConsoleError;
        failCommit = false;
      }
    }

    reset();
    failAudit = true;

    const auditFailure = await request(
      "PATCH", "/area-1", adminToken, { severity: "high" },
    );

    assert.equal(auditFailure.status, 200);
    assert.equal(records.get("flood_areas/area-1").severity, "high");
    assert.equal(auditEvents.length, 1);

    // Alert writes validate the area inside their transaction.
    reset();

    const alert = await createFloodAlert(sampleAlert());
    assert.equal(alert.areaId, "area-1");

    await assert.rejects(
      () => deleteFloodAreaForAdmin("admin", "area-1"),
      (error) => error.code === "ADMIN_AREA_HAS_ALERTS",
    );

    const originalCreatedAt = records.get(
      `flood_alerts/${alert.id}`,
    ).createdAt;

    await setFloodAlertById(alert.id, {
      ...sampleAlert(),
      title: "Updated test warning",
    });

    assert.equal(
      records.get(`flood_alerts/${alert.id}`).createdAt,
      originalCreatedAt,
    );

    await assert.rejects(
      () => createFloodAlert(sampleAlert("missing-area")),
      /Referenced flood area does not exist/,
    );

    await assert.rejects(
      () => setFloodAlertById(
        "missing-alert",
        sampleAlert("missing-area"),
      ),
      /Referenced flood area does not exist/,
    );

    // Competing area deletion and alert creation must not orphan alerts.
    reset();
    beforeCommitHook = createCommitBarrier();

    const competition = await Promise.allSettled([
      createFloodAlert(sampleAlert()),
      deleteFloodAreaForAdmin("admin", "area-1"),
    ]);

    assert.equal(
      competition.filter((result) =>
        result.status === "fulfilled",
      ).length,
      1,
    );

    assert.equal(
      competition.filter((result) =>
        result.status === "rejected",
      ).length,
      1,
    );

    assert.ok(retryCount > 0);

    for (const [key, data] of records) {
      if (key.startsWith("flood_alerts/")) {
        assert.ok(records.has(`flood_areas/${data.areaId}`));
      }
    }

    // Two updates exercise retry without duplicated audit events.
    reset();
    beforeCommitHook = createCommitBarrier();

    await Promise.all([
      updateFloodAreaForAdmin(
        "admin", "area-1", { severity: "high" },
      ),
      updateFloodAreaForAdmin(
        "admin", "area-1", { source: "updated-source" },
      ),
    ]);

    assert.ok(retryCount > 0);
    assert.equal(records.get("flood_areas/area-1").severity, "high");
    assert.equal(records.get("flood_areas/area-1").source, "updated-source");
    assert.equal(auditEvents.length, 2);

    console.log("Admin flood area management API tests passed");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });

      server.closeAllConnections();
    });
  }
}

runTests().catch((error) => {
  console.error("Admin flood area management API tests failed");
  console.error(error);
  process.exitCode = 1;
});