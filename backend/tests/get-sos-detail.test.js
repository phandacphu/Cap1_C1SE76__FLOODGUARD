const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf78-local-test-secret-only";

const users = {
  "resident-1": {
    fullName: "Resident One",
    role: "resident",
    isActive: true,
  },
  "resident-2": {
    fullName: "Resident Two",
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

const firstChangedAt = Timestamp.fromDate(
  new Date("2026-10-06T10:00:00.000Z"),
);

const secondChangedAt = Timestamp.fromDate(
  new Date("2026-10-06T11:00:00.000Z"),
);

const requestCreatedAt = Timestamp.fromDate(
  new Date("2026-10-06T10:00:00.000Z"),
);

const requestOtherCreatedAt = Timestamp.fromDate(
  new Date("2026-10-06T12:00:00.000Z"),
);

records.set("rescue_requests/request-own", {
  residentId: "resident-1",
  location: {
    latitude: 16.0544,
    longitude: 108.2022,
  },
  urgency: "high",
  numberOfPeople: 2,
  note: "CCF-78 own request",
  status: "in_progress",
  createdAt: requestCreatedAt,
  updatedAt: secondChangedAt,
});

records.set("rescue_requests/request-other", {
  residentId: "resident-2",
  location: {
    latitude: 16.0600,
    longitude: 108.2100,
  },
  urgency: "critical",
  numberOfPeople: 4,
  note: "CCF-78 other request",
  status: "submitted",
  createdAt: requestOtherCreatedAt,
  updatedAt: requestOtherCreatedAt,
});

records.set(
  "rescue_request_status_history/history-submitted",
  {
    requestId: "request-own",
    oldStatus: null,
    newStatus: "submitted",
    changedBy: "resident-1",
    note: "SOS request submitted",
    changedAt: firstChangedAt,
  },
);

records.set(
  "rescue_request_status_history/history-progress",
  {
    requestId: "request-own",
    oldStatus: "submitted",
    newStatus: "in_progress",
    changedBy: "rescue",
    note: "Rescue team started processing",
    changedAt: secondChangedAt,
  },
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

      where(fieldName, operator, expectedValue) {
        assert.equal(operator, "==");

        return {
          async get() {
            const docs = [...records.entries()]
              .filter(
                ([key, data]) =>
                  key.startsWith(prefix) &&
                  data[fieldName] === expectedValue,
              )
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

    const baseUrl =
      `http://127.0.0.1:${server.address().port}` +
      "/api/rescue-requests";

    async function get(requestId, token) {
      const headers = {};

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${baseUrl}/${requestId}`,
        {
          method: "GET",
          headers,
        },
      );

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    const missingToken = await get(
      "request-own",
    );

    assert.equal(missingToken.status, 401);

    const ownResponse = await get(
      "request-own",
      tokenFor("resident-1", "resident"),
    );

    assert.equal(ownResponse.status, 200);
    assert.equal(ownResponse.body.success, true);

    const ownRequest =
      ownResponse.body.data.rescueRequest;

    assert.equal(ownRequest.id, "request-own");
    assert.equal(ownRequest.residentId, "resident-1");
    assert.equal(ownRequest.status, "in_progress");
    assert.equal(ownRequest.statusHistory.length, 2);
    assert.equal(
      ownRequest.statusHistory[0].newStatus,
      "submitted",
    );
    assert.equal(
      ownRequest.statusHistory[1].newStatus,
      "in_progress",
    );

    const forbiddenResponse = await get(
      "request-other",
      tokenFor("resident-1", "resident"),
    );

    assert.equal(forbiddenResponse.status, 403);

    const rescueResponse = await get(
      "request-other",
      tokenFor("rescue", "rescue"),
    );

    assert.equal(rescueResponse.status, 200);
    assert.equal(
      rescueResponse.body.data.rescueRequest.id,
      "request-other",
    );

    const adminResponse = await get(
      "request-other",
      tokenFor("admin", "admin"),
    );

    assert.equal(adminResponse.status, 200);

    const notFoundResponse = await get(
      "missing-request",
      tokenFor("admin", "admin"),
    );

    assert.equal(notFoundResponse.status, 404);

    console.log("Get SOS detail API tests passed");
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
  console.error("Get SOS detail API tests failed");
  console.error(error);
  process.exitCode = 1;
});