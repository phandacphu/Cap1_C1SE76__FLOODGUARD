// Isolated HTTP + transactional Firestore substitute. Never loads a service key.
const assert = require("node:assert/strict");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const express = require("express");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "safe-location-catalog-tests-only";
const records = new Map();
let version = 0;
let sequence = 0;
let failCommit = false;
let failRead = false;
let failAudit = false;
let beforeCommit = null;
let attempts = 0;
const serverTime = FieldValue.serverTimestamp();

function copy(value) {
  if (
    value instanceof Timestamp ||
    value instanceof FieldValue ||
    value == null
  )
    return value;
  if (Array.isArray(value)) return value.map(copy);
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, copy(v)]),
    );
  return value;
}
function snapshot(ref) {
  if (failRead)
    throw new Error("Simulated database failure: secret must not escape");
  const value = copy(records.get(ref.key));
  return { id: ref.id, exists: value !== undefined, data: () => copy(value) };
}
function resolve(data) {
  const now = Timestamp.now();
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      v?.isEqual?.(serverTime) ? now : copy(v),
    ]),
  );
}
const db = {
  collection(name) {
    return {
      doc(id = `test-${++sequence}`) {
        const ref = {
          id,
          key: `${name}/${id}`,
          async get() {
            return snapshot(ref);
          },
          async create(data) {
            if (name === "audit_logs" && failAudit)
              throw new Error("Simulated audit failure");
            assert.equal(records.has(ref.key), false);
            records.set(ref.key, resolve(data));
            version++;
          },
          async set(data) {
            records.set(ref.key, resolve(data));
            version++;
          },
        };
        return ref;
      },
      async get() {
        if (failRead)
          throw new Error("Simulated database failure: secret must not escape");
        const docs = [...records.keys()]
          .filter((k) => k.startsWith(`${name}/`))
          .map((key) => snapshot({ key, id: key.slice(name.length + 1) }));
        return { docs, size: docs.length, empty: !docs.length };
      },
    };
  },
  async runTransaction(callback) {
    for (let attempt = 0; attempt < 30; attempt++) {
      attempts++;
      const readVersion = version;
      const writes = [];
      const result = await callback({
        async get(ref) {
          assert.equal(writes.length, 0, "Reads must precede writes");
          return ref.get();
        },
        create(ref, data) {
          writes.push({ type: "create", ref, data });
        },
        update(ref, data) {
          writes.push({ type: "update", ref, data });
        },
      });
      if (beforeCommit) {
        const hook = beforeCommit;
        beforeCommit = null;
        await hook();
      }
      if (version !== readVersion) continue;
      if (failCommit)
        throw new Error("Simulated commit failure: secret must not escape");
      for (const write of writes)
        assert.equal(records.has(write.ref.key), write.type === "update");
      for (const { type, ref, data } of writes) {
        records.set(ref.key, {
          ...(type === "update" ? records.get(ref.key) : {}),
          ...resolve(data),
        });
      }
      if (writes.length) version++;
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
  "/api/safe-locations",
  require("../../src/routes/safe-location.routes"),
);
app.use(
  "/api/admin/safe-locations",
  require("../../src/routes/admin-safe-location.routes"),
);

function reset() {
  records.clear();
  version++;
  sequence = 0;
  attempts = 0;
  failCommit = failRead = failAudit = false;
  beforeCommit = null;
  for (const [id, role, isActive = true] of [
    ["admin", "admin"],
    ["admin2", "admin"],
    ["resident", "resident"],
    ["rescue", "rescue"],
    ["inactive", "admin", false],
  ])
    records.set(`users/${id}`, { role, isActive });
}
function body(overrides = {}) {
  return {
    name: " TEST Shelter ",
    address: " TEST Address ",
    location: { latitude: 16.0544, longitude: 108.2022 },
    type: "shelter",
    description: " TEST ONLY ",
    ...overrides,
  };
}
function seed(id = "location-1", overrides = {}) {
  const time = Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z"));
  records.set(`safe_locations/${id}`, {
    ...body(),
    schemaVersion: 2,
    isDeleted: false,
    createdAt: time,
    updatedAt: time,
    ...overrides,
  });
  version++;
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
    { method = "GET", body, actor = "admin", tokenRole, expiresIn = "5m" } = {},
  ) {
    const headers = { "Content-Type": "application/json" };
    if (actor)
      headers.Authorization = `Bearer ${jwt.sign(
        {
          sub: actor,
          role: tokenRole ?? records.get(`users/${actor}`)?.role ?? "admin",
        },
        process.env.JWT_SECRET,
        { algorithm: "HS256", expiresIn },
      )}`;
    const result = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await result.text();
    const bodyResult = result.headers
      .get("content-type")
      ?.includes("application/json")
      ? JSON.parse(text)
      : { rawText: text };
    return { status: result.status, body: bodyResult };
  }
  try {
    await callback(api);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
module.exports = {
  records,
  db,
  reset,
  body,
  seed,
  withApi,
  Timestamp,
  count: (name) =>
    [...records.keys()].filter((key) => key.startsWith(`${name}/`)).length,
  setFailCommit: (v = true) => {
    failCommit = v;
  },
  setFailRead: (v = true) => {
    failRead = v;
  },
  setFailAudit: (v = true) => {
    failAudit = v;
  },
  beforeCommit: (hook) => {
    beforeCommit = hook;
  },
  bumpVersion: () => {
    version++;
  },
  attempts: () => attempts,
};
