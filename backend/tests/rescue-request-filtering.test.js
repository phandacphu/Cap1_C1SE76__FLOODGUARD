const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET =
  "ccf96-local-test-secret-only";

const fixedTime = Timestamp.fromDate(
  new Date("2026-10-09T00:00:00.000Z"),
);

const records = new Map();

function documentFor(collectionName, id) {
  const key = `${collectionName}/${id}`;

  return {
    id,
    key,

    async get() {
      const data = records.get(key);

      return {
        id,
        exists: data !== undefined,
        data: () => data,
      };
    },
  };
}

const db = {
  collection(collectionName) {
    return {
      doc(id) {
        return documentFor(collectionName, id);
      },

      async get() {
        const prefix = `${collectionName}/`;

        const docs = [...records.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, data]) => ({
            id: key.slice(prefix.length),
            exists: true,
            data: () => data,
          }));

        return { docs };
      },
    };
  },
};

const firebasePath = require.resolve(
  "../src/config/firebase",
);

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

records.set("users/resident-1", {
  fullName: "Resident One",
  role: "resident",
  isActive: true,
});

records.set("users/resident-2", {
  fullName: "Resident Two",
  role: "resident",
  isActive: true,
});

records.set("users/rescue-1", {
  fullName: "Rescue Staff",
  role: "rescue",
  isActive: true,
});

records.set("users/admin-1", {
  fullName: "Admin",
  role: "admin",
  isActive: true,
});

function requestData(
  residentId,
  status,
  urgency,
  createdAt,
) {
  return {
    residentId,
    location: {
      latitude: 16.0544,
      longitude: 108.2022,
    },
    urgency,
    numberOfPeople: 2,
    note: null,
    status,
    createdAt,
    updatedAt: createdAt,
  };
}

records.set(
  "rescue_requests/request-submitted",
  requestData(
    "resident-1",
    "submitted",
    "high",
    fixedTime,
  ),
);

records.set(
  "rescue_requests/request-progress",
  requestData(
    "resident-2",
    "in_progress",
    "critical",
    fixedTime,
  ),
);

records.set(
  "rescue_requests/request-assisted",
  requestData(
    "resident-1",
    "assisted",
    "low",
    fixedTime,
  ),
);

const routes = require(
  "../src/routes/rescue-request.routes",
);

const app = express();
app.use(express.json());
app.use("/api/rescue-requests", routes);

function tokenFor(userId, role) {
  return jwt.sign(
    {
      sub: userId,
      role,
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "5m",
    },
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
      "/api/rescue-requests";

    async function get(path, token) {
      const response = await fetch(
        `${baseUrl}${path}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    const rescueToken = tokenFor(
      "rescue-1",
      "rescue",
    );

    const residentToken = tokenFor(
      "resident-1",
      "resident",
    );

    const allRescueRequests = await get(
      "",
      rescueToken,
    );

    assert.equal(allRescueRequests.status, 200);
    assert.equal(
      allRescueRequests.body.data.rescueRequests
        .length,
      3,
    );

    const filteredByStatus = await get(
      "?status=in_progress",
      rescueToken,
    );

    assert.equal(filteredByStatus.status, 200);
    assert.deepEqual(
      filteredByStatus.body.data.rescueRequests.map(
        (request) => request.id,
      ),
      ["request-progress"],
    );

    const filteredByUrgency = await get(
      "?urgency=critical",
      rescueToken,
    );

    assert.equal(filteredByUrgency.status, 200);
    assert.deepEqual(
      filteredByUrgency.body.data.rescueRequests.map(
        (request) => request.id,
      ),
      ["request-progress"],
    );

    const filteredBySeverity = await get(
      "?severity=critical",
      rescueToken,
    );

    assert.equal(filteredBySeverity.status, 200);
    assert.deepEqual(
      filteredBySeverity.body.data.rescueRequests.map(
        (request) => request.id,
      ),
      ["request-progress"],
    );

    const filteredByBoth = await get(
      "?status=in_progress&urgency=critical",
      rescueToken,
    );

    assert.equal(filteredByBoth.status, 200);
    assert.deepEqual(
      filteredByBoth.body.data.rescueRequests.map(
        (request) => request.id,
      ),
      ["request-progress"],
    );

    const residentRequests = await get(
      "?status=submitted",
      residentToken,
    );

    assert.equal(residentRequests.status, 200);
    assert.deepEqual(
      residentRequests.body.data.rescueRequests.map(
        (request) => request.id,
      ),
      ["request-submitted"],
    );

    const invalidStatus = await get(
      "?status=unknown",
      rescueToken,
    );

    assert.equal(invalidStatus.status, 400);
    assert.equal(
      invalidStatus.body.success,
      false,
    );

    const invalidUrgency = await get(
      "?urgency=urgent",
      rescueToken,
    );

    assert.equal(invalidUrgency.status, 400);
    assert.equal(
      invalidUrgency.body.success,
      false,
    );

    const mismatchedFilters = await get(
      "?urgency=high&severity=critical",
      rescueToken,
    );

    assert.equal(mismatchedFilters.status, 400);
    assert.equal(
      mismatchedFilters.body.success,
      false,
    );

    console.log(
      "Rescue request filtering tests passed",
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
    "Rescue request filtering tests failed",
  );
  console.error(error);
  process.exitCode = 1;
});