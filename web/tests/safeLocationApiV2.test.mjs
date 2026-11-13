import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
function load(path) {
  const filename = resolve(root, path);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename, reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length ?? 0, 0);
  const requireLocal = (specifier) => {
    if (specifier === "../../../api/authApi") return { API_URL: "https://render.test/api" };
    if (specifier === "../../../api/http") return { ApiError };
    if (specifier.startsWith("./")) return load(resolve(dirname(filename), specifier + ".ts").slice(root.length + 1));
    throw new Error(`Unexpected import: ${specifier}`);
  };
  new Function("require", "module", "exports", compiled.outputText)(requireLocal, module, module.exports);
  return module.exports;
}

const { safeLocationApi, fetchAdminSafeLocations, buildSafeLocationPatch } = load("src/pages/admin/safe-location/safeLocationApi.ts");
const original = { id: "TEST-1", name: "Diem A", address: "Dia chi", type: "shelter",
  location: { latitude: 0, longitude: 0 }, description: "Mo ta", createdAt: null, updatedAt: null };
const fields = { name: "Diem A", address: "Dia chi", type: "shelter",
  location: { latitude: 0, longitude: 0 }, description: "Mo ta" };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status,
  json: async () => ({ success: status >= 200 && status < 300, message: "fixture", data }) });
const calls = [];
globalThis.localStorage = { getItem: () => "test-jwt-not-real" };
function stub(handler) { calls.length = 0; globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  return handler(url, options);
}; }

const path = "/admin/safe-locations";
test("GET Admin list uses JWT, no query and parses empty as success", async () => {
  stub(() => response({ safeLocations: [] }));
  assert.deepEqual(await fetchAdminSafeLocations("jwt-from-auth-context"), []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://render.test/api${path}`);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, "Bearer jwt-from-auth-context");
  assert.equal(calls[0].options.body, undefined);
});

test("GET detail uses exactly one ID; 404 is not mock fallback", async () => {
  stub(() => response({ safeLocation: original }));
  assert.equal((await safeLocationApi.get("TEST-1")).id, "TEST-1");
  assert.equal(calls[0].url, `https://render.test/api${path}/TEST-1`);
  stub(() => response(undefined, 404));
  await assert.rejects(safeLocationApi.get("TEST-1"), e => e.status === 404);
  assert.equal(safeLocationApi.demo, false);
});

test("POST sends only contract fields, requires HTTP 201 and reads saved ID", async () => {
  stub(() => response({ safeLocation: original }, 201));
  const created = await safeLocationApi.save(null, fields);
  assert.equal(created.id, "TEST-1");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), fields);
  assert.equal(Object.keys(JSON.parse(calls[0].options.body)).length, 5);
  stub(() => response({ safeLocation: original }, 200));
  await assert.rejects(safeLocationApi.save(null, fields), e => e.status === 200);
});

test("PATCH sends changed fields only; updates coordinates as a complete pair and preserves ID", async () => {
  const next = { ...fields, location: { latitude: 16.055, longitude: 108.203 }, description: null };
  assert.deepEqual(buildSafeLocationPatch(original, next), { location: next.location, description: null });
  stub(() => response({ safeLocation: { ...original, ...next } }));
  const saved = await safeLocationApi.save("TEST-1", next, original);
  assert.equal(saved.id, "TEST-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].url, `https://render.test/api${path}/TEST-1`);
  assert.deepEqual(JSON.parse(calls[0].options.body), { description: null, location: next.location });
  assert.equal(JSON.parse(calls[0].options.body).id, undefined);
  stub(() => response({ safeLocation: { ...original, ...next, id: "WRONG" } }));
  await assert.rejects(safeLocationApi.save("TEST-1", next, original), e => e.status === 500);
});

test("unchanged PATCH performs GET by ID but sends no mutation", async () => {
  stub(() => response({ safeLocation: original }));
  const saved = await safeLocationApi.save("TEST-1", fields, original);
  assert.equal(saved.id, "TEST-1");
  assert.deepEqual(calls.map(c => c.options.method), ["GET"]);
});

test("DELETE has no body; validates id/deleted response", async () => {
  stub(() => response({ id: "TEST-1", deleted: true, deletedAt: "2026-11-09T00:00:00Z" }));
  await safeLocationApi.remove("TEST-1");
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.headers["Content-Type"], undefined);
  stub(() => response({ id: "TEST-2", deleted: true }));
  await assert.rejects(safeLocationApi.remove("TEST-1"), e => e.status === 500);
});

test("401, 403, 500, malformed success and non-JSON errors never become []", async () => {
  for (const code of [401, 403, 500]) {
    stub(() => response(undefined, code));
    await assert.rejects(safeLocationApi.list(), e => e.status === code);
  }
  stub(() => response({ invalid: [] }));
  await assert.rejects(safeLocationApi.list(), e => e.status === 500);
  stub(() => ({ ok: false, status: 500, json: async () => { throw new SyntaxError("bad body"); } }));
  await assert.rejects(safeLocationApi.list(), e => e.status === 500);
});

test("timeout/error never auto-repeats POST", async () => {
  const aborted = Object.assign(new Error("request aborted"), { name: "AbortError" });
  stub(async () => { throw aborted; });
  await assert.rejects(safeLocationApi.save(null, fields), e => e.status === 504);
  assert.equal(calls.length, 1);
});

test("Dashboard uses authenticated Admin catalogue; no status/capacity counting", () => {
  const overview = readFileSync(resolve(root, "src/pages/admin/adminApi.ts"), "utf8");
  const dashboard = readFileSync(resolve(root, "src/pages/admin/AdminDashboard.tsx"), "utf8");
  assert.match(overview, /fetchAdminSafeLocations\(token\)/);
  assert.doesNotMatch(dashboard, /s\.status === "active"|s\.capacity|totalCapacity|openShelters/);
  assert.match(dashboard, /overview\.safeLocations\.ok/);
  assert.match(dashboard, /"—"/);
});
