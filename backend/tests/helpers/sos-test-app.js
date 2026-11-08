// In-memory Firestore substitute. No service account or network database is loaded.
const assert = require("node:assert/strict");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const express = require("express");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "sos-direct-rescue-tests-only";
const records = new Map();
let version = 0;
let sequence = 0;
let failCommit = false;
let failRead = false;
let beforeCommit = null;
let transactionAttempts = 0;
const serverTimestamp = FieldValue.serverTimestamp();

function copy(value) {
  if (value instanceof Timestamp || value == null) return value;
  if (Array.isArray(value)) return value.map(copy);
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, copy(v)]),
    );
  return value;
}
function snapshot(key) {
  if (failRead) throw new Error("Simulated Firestore read failure");
  const value = copy(records.get(key));
  return {
    id: key.slice(key.indexOf("/") + 1),
    exists: value !== undefined,
    data: () => copy(value),
  };
}
function resolveTimestamps(data, time) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value?.isEqual?.(serverTimestamp) ? time : value,
    ]),
  );
}
const db = {
  collection(name) {
    const query = (conditions = []) => ({
      where(field, op, value) {
        assert.equal(op, "==");
        return query([...conditions, [field, value]]);
      },
      async get() {
        const docs = [...records.entries()]
          .filter(
            ([key, value]) =>
              key.startsWith(`${name}/`) &&
              conditions.every(
                ([field, expected]) => value[field] === expected,
              ),
          )
          .map(([key]) => snapshot(key));
        return { docs, empty: !docs.length, size: docs.length };
      },
    });
    return {
      ...query(),
      doc(id = `test-${++sequence}`) {
        const ref = {
          id,
          key: `${name}/${id}`,
          async get() {
            return snapshot(ref.key);
          },
        };
        return ref;
      },
    };
  },
  async runTransaction(callback) {
    for (let attempt = 0; attempt < 20; attempt++) {
      transactionAttempts++;
      const readVersion = version;
      const writes = [];
      const result = await callback({
        async get(ref) {
          assert.equal(writes.length, 0, "All reads must precede writes");
          return ref.get();
        },
        create(ref, data) {
          writes.push({ type: "create", ref, data });
        },
        set(ref, data) {
          writes.push({ type: "set", ref, data });
        },
        update(ref, data) {
          writes.push({ type: "update", ref, data });
        },
        delete(ref) {
          writes.push({ type: "delete", ref });
        },
      });
      if (beforeCommit) {
        const hook = beforeCommit;
        beforeCommit = null;
        await hook();
      }
      if (version !== readVersion) continue;
      if (failCommit) throw new Error("Simulated Firestore commit failure");
      for (const { type, ref } of writes) {
        if (type === "create") assert.equal(records.has(ref.key), false);
        if (type === "update") assert.equal(records.has(ref.key), true);
      }
      const time = Timestamp.now();
      const next = new Map(records);
      for (const { type, ref, data } of writes) {
        if (type === "delete") next.delete(ref.key);
        else
          next.set(
            ref.key,
            copy({
              ...(type === "update" ? next.get(ref.key) : {}),
              ...resolveTimestamps(data, time),
            }),
          );
      }
      records.clear();
      for (const [key, value] of next) records.set(key, value);
      version++;
      return result;
    }
    throw new Error("Transaction retry limit exceeded");
  },
};
const firebasePath = require.resolve("../../src/config/firebase");
require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};
const app = express();
app.set("env", "test");
app.use(express.json());
app.use(
  "/api/rescue-requests",
  require("../../src/routes/rescue-request.routes"),
);
app.use(
  "/api/admin/rescue-requests",
  require("../../src/routes/admin-sos-monitoring.routes"),
);
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed")
    return res.status(400).json({ success: false, message: "Invalid JSON" });
  next(error);
});
function reset() {
  records.clear();
  version++;
  failCommit = false;
  failRead = false;
  beforeCommit = null;
  transactionAttempts = 0;
  for (const [id, role, isActive = true] of [
    ["resident", "resident"],
    ["other", "resident"],
    ["rescue", "rescue"],
    ["rescue2", "rescue"],
    ["admin", "admin"],
    ["inactive", "resident", false],
  ])
    records.set(`users/${id}`, { role, isActive });
}
function validBody() {
  return {
    location: { latitude: 16.0544, longitude: 108.2022 },
    situations: ["trapped", "injured"],
    numberOfPeople: 3,
    waterLevel: "waist",
    note: "  TEST ONLY  ",
  };
}
function seedRequest(id = "legacy", data = {}) {
  const time = Timestamp.fromDate(new Date("2026-10-01T00:00:00Z"));
  records.set(`rescue_requests/${id}`, {
    residentId: "resident",
    location: { latitude: 16, longitude: 108 },
    urgency: "high",
    numberOfPeople: 1,
    status: "submitted",
    note: null,
    createdAt: time,
    updatedAt: time,
    ...data,
  });
  version++;
  return id;
}
async function withApi(callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function api(
    path,
    { method = "GET", body, actor = "resident", tokenRole, raw } = {},
  ) {
    const headers = { "Content-Type": "application/json" };
    if (actor)
      headers.Authorization = `Bearer ${jwt.sign({ sub: actor, role: tokenRole ?? records.get(`users/${actor}`)?.role ?? "resident" }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "5m" })}`;
    const response = await fetch(base + path, {
      method,
      headers,
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    await callback(api);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
module.exports = {
  db,
  records,
  reset,
  validBody,
  seedRequest,
  withApi,
  Timestamp,
  count: (collection) =>
    [...records.keys()].filter((key) => key.startsWith(`${collection}/`))
      .length,
  failCommit: (value = true) => {
    failCommit = value;
  },
  failRead: (value = true) => {
    failRead = value;
  },
  beforeCommit: (hook) => {
    beforeCommit = hook;
  },
  bumpVersion: () => {
    version++;
  },
  attempts: () => transactionAttempts,
};
