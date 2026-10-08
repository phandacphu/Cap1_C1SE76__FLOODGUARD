const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf77-local-test-secret-only";

const users = {
  "resident-1": {
    fullName: "Resident One",
    role: "resident",
    isActive: true,
  },
  rescue: {
    fullName: "Rescue Staff",
    role: "rescue",
    isActive: true,
  },
  admin: {
    fullName: "Admin",
    role: "admin",
    isActive: true,
  },
};

const records = new Map();

function requestData(
  residentId,
  createdAt,
  urgency = "high",
) {
  return {
    residentId,
    location: {
      latitude: 16.0544,
      longitude: 108.2022,
    },
    urgency,
    numberOfPeople: 2,
    note: "CCF-77 test",
    status: "submitted",
    createdAt,
    updatedAt: createdAt,
  };
}

const older = Timestamp.fromDate(
  new Date("2026-10-06T10:00:00.000Z"),
);

const newer = Timestamp.fromDate(
  new Date("2026-10-06T12:00:00.000Z"),
);

const newest = Timestamp.fromDate(
  new Date("2026-10-06T14:00:00.000Z"),
);

records.set(
  "rescue_requests/request-old",
  requestData("resident-1", older),
);

records.set(
  "rescue_requests/request-new",
  requestData("resident-1", newer),
);

records.set(
  "rescue_requests/request-other",
  requestData("resident-2", newest),
);

const db = {
  collection(collectionName) {
    const prefix = `${collectionName}/`;

    return {
      doc(id) {
        const key = `${collectionName}/${id}`;

        return {
          id,
          async get() {
            const data =
              collectionName === "users"
                ? users[id]
                : records.get(key);

            return {
              id,
              exists: data !== undefined,
              data: () => data,
            };
          },
        };
      },

      async get() {
        const docs = [...records.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, data]) => ({
            id: key.slice(prefix.length),
            exists: true,
            data: () => data,
          }));

        return {
          empty: docs.length === 0,
          docs,
        };
      },
    };
  },
};

const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const routes = require("../src/routes/rescue-request.routes");

const app = express();
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

    const url =
      `http://127.0.0.1:${server.address().port}` +
      "/api/rescue-requests";

    async function get(token) {
      const headers = {};

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    const missingToken = await get();

    assert.equal(missingToken.status, 401);

    const residentResponse = await get(
      tokenFor("resident-1", "resident"),
    );

    assert.equal(residentResponse.status, 200);
    assert.equal(residentResponse.body.success, true);

    const residentRequests =
      residentResponse.body.data.rescueRequests;

    assert.equal(residentRequests.length, 2);
    assert.ok(
      residentRequests.every(
        (request) => request.residentId === "resident-1",
      ),
    );
    assert.equal(
      residentRequests[0].id,
      "request-new",
    );

    const rescueResponse = await get(
      tokenFor("rescue", "rescue"),
    );

    assert.equal(rescueResponse.status, 200);
    assert.equal(
      rescueResponse.body.data.rescueRequests.length,
      3,
    );
    assert.equal(
      rescueResponse.body.data.rescueRequests[0].id,
      "request-other",
    );

    const adminResponse = await get(
      tokenFor("admin", "admin"),
    );

    assert.equal(adminResponse.status, 200);
    assert.equal(
      adminResponse.body.data.rescueRequests.length,
      3,
    );

    console.log("Get SOS requests API tests passed");
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
  console.error("Get SOS requests API tests failed");
  console.error(error);
  process.exitCode = 1;
});