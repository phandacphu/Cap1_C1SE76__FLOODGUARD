const assert = require("node:assert/strict");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");

// Optimistic transaction substitute: no credentials, no network, no Firebase app.
function createTestDb() {
  const records = new Map();
  let version = 0, sequence = 0, beforeCommit, afterCommit;
  let failRead = false, failCommit = false, failAudit = false;
  const serverTime = FieldValue.serverTimestamp();
  function copy(value) {
    if (value instanceof Timestamp || value instanceof FieldValue || value == null) return value;
    if (Array.isArray(value)) return value.map(copy);
    if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
    return value;
  }
  function resolve(value, time) {
    if (value instanceof FieldValue && value.isEqual(serverTime)) return time;
    if (value instanceof Timestamp || value == null) return value;
    if (Array.isArray(value)) return value.map((v) => resolve(v, time));
    if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, time)]));
    return value;
  }
  function snapshot(ref) {
    if (failRead) throw new Error("SIMULATED_DATABASE_FAILURE_do_not_expose");
    const value = copy(records.get(ref.path));
    return { id: ref.id, exists: value !== undefined, data: () => copy(value) };
  }
  const db = {
    collection(name) {
      function query(conditions = [], ordered = false, cursor = null, maximum = Infinity) {
        return {
          where(field, op, expected) { assert.equal(op, "=="); return query([...conditions, [field, expected]], ordered, cursor, maximum); },
          orderBy(field) { assert.equal(String(field), "__name__"); return query(conditions, true, cursor, maximum); },
          startAfter(id) { assert.equal(typeof id, "string"); return query(conditions, ordered, id, maximum); },
          limit(count) { assert.ok(Number.isSafeInteger(count) && count > 0); return query(conditions, ordered, cursor, count); },
          async get() {
            if (failRead) throw new Error("SIMULATED_DATABASE_FAILURE_do_not_expose");
            let docs = [...records.keys()].filter((path) => path.startsWith(`${name}/`))
              .map((path) => snapshot({ path, id: path.slice(name.length + 1) }))
              .filter((s) => conditions.every(([field, value]) => s.data()[field] === value));
            if (ordered) docs.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
            if (cursor !== null) docs = docs.filter((doc) => doc.id > cursor);
            docs = docs.slice(0, maximum);
            return { docs, size: docs.length, empty: !docs.length };
          },
          doc(id = `test-${++sequence}`) {
            const ref = { id, path: `${name}/${id}`, async get() { return snapshot(ref); } };
            return ref;
          },
        };
      }
      return query();
    },
    async runTransaction(callback) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const readVersion = version, writes = [];
        const result = await callback({
          async get(ref) { assert.equal(writes.length, 0, "Reads must precede writes"); return ref.get(); },
          create(ref, data) { writes.push({ ref, data, create: true }); },
          update(ref, data) { writes.push({ ref, data, create: false }); },
        });
        if (beforeCommit) { const hook = beforeCommit; beforeCommit = null; await hook(); }
        if (readVersion !== version) continue;
        if (failCommit || (failAudit && writes.some((w) => w.ref.path.startsWith("audit_logs/")))) {
          throw new Error("SIMULATED_COMMIT_FAILURE_do_not_expose");
        }
        for (const { ref, create } of writes) assert.equal(records.has(ref.path), !create);
        const time = Timestamp.now();
        for (const { ref, data, create } of writes) records.set(ref.path, {
          ...(create ? {} : records.get(ref.path)), ...resolve(data, time),
        });
        if (writes.length) {
          version++;
          if (afterCommit) { const hook = afterCommit; afterCommit = null; await hook(); }
        }
        return result;
      }
      throw new Error("Transaction retry limit exceeded");
    },
  };
  function put(path, value) { records.set(path, copy(value)); version++; }
  function reset() {
    records.clear(); version++; sequence = 0;
    beforeCommit = afterCommit = null; failRead = failCommit = failAudit = false;
    for (const [id, role, isActive = true] of [["admin", "admin"], ["admin2", "admin"],
      ["resident", "resident"], ["rescue", "rescue"], ["inactive", "admin", false]]) put(`users/${id}`, { role, isActive });
  }
  reset();
  return { db, records, put, reset, Timestamp,
    count: (name) => [...records.keys()].filter((p) => p.startsWith(`${name}/`)).length,
    beforeCommit: (hook) => { beforeCommit = hook; }, afterCommit: (hook) => { afterCommit = hook; },
    failReads: (value = true) => { failRead = value; }, failCommits: (value = true) => { failCommit = value; },
    failAudits: (value = true) => { failAudit = value; } };
}
module.exports = { createTestDb };
