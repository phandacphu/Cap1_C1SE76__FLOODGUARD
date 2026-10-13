const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const {
  Timestamp,
  FieldValue,
} = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf115-local-test-secret-only";

const initialTime = Timestamp.fromDate(
  new Date("2026-10-13T06:00:00.000Z"),
);

const writeTime = Timestamp.fromDate(
  new Date("2026-10-13T07:00:00.000Z"),
);

const records = new Map();
const auditEvents = [];

let sequence = 0;
let failCommit = false;
let failAudit = false;

function copy(value) {
  if (
    value instanceof Timestamp ||
    value instanceof FieldValue
  ) {
    return value;
  }

  if (Array.isArray(value)) return value.map(copy);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        copy(item),
      ]),
    );
  }

  return value;
}

function snapshot(ref) {
  const data = records.get(ref.key);

  return {
    id: ref.id,
    exists: data !== undefined,
    data: () => copy(data),
  };
}

function resolveTimestamps(data) {
  const saved = copy(data);
  const serverTimestamp = FieldValue.serverTimestamp();

  for (const field of ["createdAt", "updatedAt"]) {
    const value = data[field];

    if (
      value instanceof FieldValue &&
      value.isEqual(serverTimestamp)
    ) {
      saved[field] = writeTime;
    }
  }

  return saved;
}

const db = {
  collection(collectionName) {
    return {
      doc(id = `generated-${++sequence}`) {
        const ref = {
          id,
          key: `${collectionName}/${id}`,
          get: async () => snapshot(ref),
        };

        return ref;
      },

      async get() {
        const docs = [...records.keys()]
          .filter((key) =>
            key.startsWith(`${collectionName}/`),
          )
          .map((key) =>
            snapshot({
              id: key.slice(collectionName.length + 1),
              key,
            }),
          );

        return {
          docs,
          empty: docs.length === 0,
          size: docs.length,
        };
      },
    };
  },

  async runTransaction(callback) {
    const writes = [];
    let writesStarted = false;

    const transaction = {
      async get(ref) {
        assert.equal(
          writesStarted,
          false,
          "All transaction reads must precede writes",
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
    };

    const result = await callback(transaction);

    if (failCommit) {
      throw new Error("Simulated commit failure");
    }

    // Validate every write before changing stored data.
    for (const write of writes) {
      assert.equal(
        records.has(write.ref.key),
        write.type === "update",
      );
    }

    for (const write of writes) {
      const saved = resolveTimestamps(write.data);

      records.set(
        write.ref.key,
        write.type === "update"
          ? { ...records.get(write.ref.key), ...saved }
          : saved,
      );
    }

    return result;
  },
};

// Replace Firebase before importing application modules.
const firebasePath = require.resolve(
  "../src/config/firebase",
);

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

// Check audit input using the real validation function.
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
    async logAuditEvent(data) {
      const normalized = normalizeAuditLogData(data);

      if (failAudit) {
        return {
          success: false,
          code: "AUDIT_WRITE_FAILED",
        };
      }

      auditEvents.push(copy(normalized));

      return {
        success: true,
        id: `audit-${auditEvents.length}`,
      };
    },
  },
};

const routes = require(
  "../src/routes/admin-safe-location.routes",
);

const {
  normalizeSafeLocationData,
} = require("../src/services/safe-location.service");

const {
  updateSafeLocationForAdmin,
} = require("../src/services/admin-safe-location.service");

const app = express();
app.set("env", "test");
app.use(express.json());
app.use("/api/admin/safe-locations", routes);

function validBody() {
  return {
    name: " TEST ONLY Shelter ",
    address: " Test address ",
    location: {
      latitude: 16.0544,
      longitude: 108.2022,
    },
    type: "shelter",
    capacity: 100,
    capacityNote: " Test capacity ",
    description: " Simulated safe location ",
    contactPhone: " 0900000000 ",
    status: "active",
  };
}

function reset() {
  records.clear();
  auditEvents.length = 0;
  failCommit = false;
  failAudit = false;

  for (const [id, role, isActive] of [
    ["admin", "admin", true],
    ["resident", "resident", true],
    ["rescue", "rescue", true],
    ["inactive", "admin", false],
    ["demoted", "rescue", true],
  ]) {
    records.set(`users/${id}`, {
      role,
      isActive,
    });
  }

  records.set("safe_locations/location-1", {
    ...normalizeSafeLocationData(validBody()),
    createdAt: initialTime,
    updatedAt: initialTime,
    extraStoredField: "preserve-me",
  });

  records.set("safe_location_services/service-1", {
    safeLocationId: "location-1",
    name: "Medical support",
    isAvailable: true,
  });
}

function tokenFor(
  id,
  role = "admin",
  expiresIn = "5m",
) {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn },
  );
}

async function runTests() {
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const baseUrl =
      `http://127.0.0.1:${server.address().port}` +
      "/api/admin/safe-locations";

    async function request(
      method,
      path = "",
      body,
      token = tokenFor("admin"),
    ) {
      const headers = {
        "Content-Type": "application/json",
      };

      if (token !== null) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${baseUrl}${path}`,
        {
          method,
          headers,
          ...(body === undefined
            ? {}
            : { body: JSON.stringify(body) }),
        },
      );

      const responseText = await response.text();
      const contentType =
        response.headers.get("content-type") || "";

      return {
        status: response.status,
        body: contentType.includes("application/json")
          ? JSON.parse(responseText)
          : responseText,
      };
    }

    async function expectRejected(
      method,
      path,
      body,
      expectedStatus,
      token = tokenFor("admin"),
    ) {
      const before = copy([...records.entries()]);
      const auditBefore = copy(auditEvents);

      const result = await request(
        method,
        path,
        body,
        token,
      );

      assert.equal(result.status, expectedStatus);

      if (
        result.body !== null &&
        typeof result.body === "object"
      ) {
        assert.equal(result.body.success, false);
      }

      assert.deepEqual(
        [...records.entries()],
        before,
        "Rejected requests must not change data",
      );

      assert.deepEqual(
        auditEvents,
        auditBefore,
        "Rejected requests must not add success audit",
      );
    }

    reset();

    // Missing, invalid and expired JWT.
    await expectRejected(
      "GET", "", undefined, 401, null,
    );

    await expectRejected(
      "GET", "", undefined, 401, "invalid-token",
    );

    await expectRejected(
      "GET",
      "",
      undefined,
      401,
      tokenFor("admin", "admin", -1),
    );

    // Middleware role and current database role/activity.
    for (const [id, role, expectedStatus] of [
      ["resident", "resident", 403],
      ["rescue", "rescue", 403],
      ["inactive", "admin", 403],
      ["deleted", "admin", 401],
      ["demoted", "admin", 403],
    ]) {
      for (const [method, path, body] of [
        ["GET", "", undefined],
        ["GET", "/location-1", undefined],
        ["POST", "", validBody()],
        ["PATCH", "/location-1", { status: "inactive" }],
      ]) {
        await expectRejected(
          method,
          path,
          body,
          expectedStatus,
          tokenFor(id, role),
        );
      }
    }

    // Admin can read active and inactive locations.
    records.set("safe_locations/inactive-location", {
      ...records.get("safe_locations/location-1"),
      status: "inactive",
    });

    const list = await request("GET");

    assert.equal(list.status, 200);
    assert.equal(list.body.success, true);
    assert.equal(list.body.data.safeLocations.length, 2);
    assert.equal(auditEvents.length, 0);

    const detail = await request("GET", "/location-1");
    const detailLocation = detail.body.data.safeLocation;

    assert.equal(detail.status, 200);
    assert.equal(detailLocation.id, "location-1");
    assert.equal(
      detailLocation.createdAt,
      initialTime.toDate().toISOString(),
    );
    assert.equal(
      Object.hasOwn(detailLocation, "extraStoredField"),
      false,
    );

    await expectRejected(
      "GET", "/missing", undefined, 404,
    );

    await expectRejected(
      "GET", "?status=active", undefined, 400,
    );

    await expectRejected(
      "PATCH", "/missing", { status: "inactive" }, 404,
    );

    // Create and normalize data.
    const created = await request(
      "POST",
      "",
      validBody(),
    );

    assert.equal(created.status, 201);
    assert.equal(created.body.success, true);

    const newLocation = created.body.data.safeLocation;

    assert.equal(newLocation.name, "TEST ONLY Shelter");
    assert.equal(newLocation.address, "Test address");
    assert.equal(newLocation.contactPhone, "0900000000");
    assert.equal(
      newLocation.createdAt,
      writeTime.toDate().toISOString(),
    );
    assert.equal(
      newLocation.updatedAt,
      newLocation.createdAt,
    );

    assert.equal(auditEvents.length, 1);
    assert.equal(
      auditEvents[0].action,
      "safe_location.create",
    );
    assert.deepEqual(auditEvents[0].actor, {
      id: "admin",
      role: "admin",
    });
    assert.equal(
      auditEvents[0].target.id,
      newLocation.id,
    );
    assert.equal(
      auditEvents[0].metadata.changedFields.length,
      9,
    );
    assert.ok(
      auditEvents[0].metadata.changedFields.includes(
        "contactPhone",
      ),
    );

    // Invalid create bodies must not save anything.
    for (const body of [
      {},
      [],
      null,
      { ...validBody(), name: " " },
      { ...validBody(), address: "" },
      { ...validBody(), type: "invalid" },
      { ...validBody(), status: "deleted" },
      { ...validBody(), capacity: -1 },
      { ...validBody(), capacity: 1.5 },
      { ...validBody(), capacity: "100" },
      { ...validBody(), description: 123 },
      { ...validBody(), contactPhone: 123 },
      { ...validBody(), capacityNote: false },
      { ...validBody(), createdAt: "client-time" },
      { ...validBody(), actorId: "other-admin" },
      {
        ...validBody(),
        location: { latitude: 91, longitude: 108 },
      },
      {
        ...validBody(),
        location: { latitude: 16, longitude: 181 },
      },
      {
        ...validBody(),
        location: { latitude: "16", longitude: 108 },
      },
      {
        ...validBody(),
        location: { latitude: 16 },
      },
      {
        ...validBody(),
        location: {
          latitude: 16,
          longitude: 108,
          altitude: 10,
        },
      },
    ]) {
      await expectRejected("POST", "", body, 400);
    }

    // JSON cannot represent non-finite numbers.
    // Test these directly through the normalizer.
    for (const value of [NaN, Infinity, -Infinity]) {
      for (const field of ["latitude", "longitude"]) {
        const body = validBody();
        body.location[field] = value;

        assert.throws(
          () => normalizeSafeLocationData(body),
          /numeric latitude and longitude/,
        );
      }
    }

    // Boundary coordinates and capacity zero are valid.
    const boundary = await request("POST", "", {
      ...validBody(),
      location: {
        latitude: -90,
        longitude: 180,
      },
      capacity: 0,
      description: null,
      contactPhone: null,
      capacityNote: " ",
    });

    assert.equal(boundary.status, 201);
    assert.equal(
      boundary.body.data.safeLocation.capacity,
      0,
    );
    assert.equal(
      boundary.body.data.safeLocation.capacityNote,
      null,
    );

    reset();

    // Partial update preserves existing unrelated data.
    const serviceBefore = copy(
      records.get("safe_location_services/service-1"),
    );

    const updated = await request(
      "PATCH",
      "/location-1",
      {
        name: " Updated test shelter ",
        capacity: 120,
        contactPhone: null,
      },
    );

    assert.equal(updated.status, 200);

    const updatedLocation =
      updated.body.data.safeLocation;

    assert.equal(
      updatedLocation.name,
      "Updated test shelter",
    );
    assert.equal(updatedLocation.capacity, 120);
    assert.equal(
      updatedLocation.createdAt,
      initialTime.toDate().toISOString(),
    );
    assert.equal(
      updatedLocation.updatedAt,
      writeTime.toDate().toISOString(),
    );

    const stored = records.get(
      "safe_locations/location-1",
    );

    assert.equal(stored.extraStoredField, "preserve-me");
    assert.equal(stored.address, "Test address");
    assert.equal(stored.contactPhone, null);
    assert.deepEqual(
      records.get("safe_location_services/service-1"),
      serviceBefore,
    );

    assert.equal(auditEvents.length, 1);
    assert.equal(
      auditEvents[0].action,
      "safe_location.update",
    );
    assert.deepEqual(
      [...auditEvents[0].metadata.changedFields].sort(),
      ["capacity", "contactPhone", "name"],
    );

    // Deactivate preserves the document and linked services.
    const deactivated = await request(
      "PATCH",
      "/location-1",
      { status: "inactive" },
    );

    assert.equal(deactivated.status, 200);
    assert.equal(
      deactivated.body.data.safeLocation.status,
      "inactive",
    );
    assert.ok(
      records.has("safe_locations/location-1"),
    );
    assert.ok(
      records.has("safe_location_services/service-1"),
    );
    assert.equal(auditEvents.length, 2);
    assert.deepEqual(
      auditEvents[1].metadata.changedFields,
      ["status"],
    );

    // Repeating unchanged input must not write or add audit.
    const beforeNoOp = copy(
      records.get("safe_locations/location-1"),
    );

    const repeated = await request(
      "PATCH",
      "/location-1",
      { status: "inactive" },
    );

    assert.equal(repeated.status, 200);
    assert.deepEqual(
      records.get("safe_locations/location-1"),
      beforeNoOp,
    );
    assert.equal(auditEvents.length, 2);

    const reactivated = await request(
      "PATCH",
      "/location-1",
      { status: "active" },
    );

    assert.equal(reactivated.status, 200);
    assert.equal(
      reactivated.body.data.safeLocation.status,
      "active",
    );

    // Updating location requires a complete coordinate pair.
    const moved = await request(
      "PATCH",
      "/location-1",
      {
        location: {
          latitude: 10,
          longitude: 106,
        },
      },
    );

    assert.equal(moved.status, 200);
    assert.deepEqual(
      moved.body.data.safeLocation.location,
      {
        latitude: 10,
        longitude: 106,
      },
    );

    for (const body of [
      {},
      [],
      null,
      { id: "other-id" },
      { updatedAt: "client-time" },
      { services: [] },
      { status: "deleted" },
      { capacity: -1 },
      { location: { latitude: 16 } },
      {
        location: {
          latitude: 16,
          longitude: 181,
        },
      },
    ]) {
      await expectRejected(
        "PATCH",
        "/location-1",
        body,
        400,
      );
    }

    // Reject invalid document IDs at service level.
    for (const locationId of [
      "",
      "bad/id",
      ".",
      "..",
      "x".repeat(1501),
    ]) {
      await assert.rejects(
        () => updateSafeLocationForAdmin(
          "admin",
          locationId,
          { status: "inactive" },
        ),
        (error) =>
          error.code === "INVALID_ADMIN_SAFE_LOCATION_ID",
      );
    }

    // Failed transaction must save no data or success audit.
    reset();
    failCommit = true;

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      await expectRejected(
        "POST",
        "",
        validBody(),
        500,
      );

      await expectRejected(
        "PATCH",
        "/location-1",
        { status: "inactive" },
        500,
      );
    } finally {
      console.error = originalConsoleError;
      failCommit = false;
    }

    // Best-effort audit failure does not undo business success.
    reset();
    failAudit = true;

    const auditFailure = await request(
      "PATCH",
      "/location-1",
      { status: "inactive" },
    );

    assert.equal(auditFailure.status, 200);
    assert.equal(
      records.get("safe_locations/location-1").status,
      "inactive",
    );
    assert.equal(auditEvents.length, 0);

    console.log(
      "Admin safe location management API tests passed",
    );
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
  console.error(
    "Admin safe location management API tests failed",
  );
  console.error(error);
  process.exitCode = 1;
});