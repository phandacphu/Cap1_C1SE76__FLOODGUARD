import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

// Compile the actual client modules in memory. All HTTP calls below use a stub;
// no production login, Firestore or live data mutations are involved.
const root = new URL("../src/pages/admin/flood-area/", import.meta.url);
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const typesUrl = moduleUrl(compile(await readFile(new URL("floodAreaTypes.ts", root), "utf8")));
const types = await import(typesUrl);
const serviceSource = (await readFile(new URL("floodAreaService.ts", root), "utf8"))
  .replace("import.meta.env.VITE_API_URL", '"https://contract.invalid/api"')
  .replace('"./floodAreaTypes"', JSON.stringify(typesUrl));
const service = await import(moduleUrl(compile(serviceSource)));
const stats = await import(moduleUrl(compile(await readFile(new URL("../src/pages/admin/adminStats.ts", import.meta.url), "utf8"))));

// Exercise the real PR #112 backend validator with isolated dependencies.
const backendSource = await readFile(new URL("../../backend/src/services/flood-area.service.js", import.meta.url), "utf8");
const backendModule = { exports: {} };
new Function("require", "module", "exports", backendSource)((name) => {
  if (name === "../config/firebase") return { db: {} };
  if (name === "firebase-admin/firestore") return { FieldValue: {} };
  throw new Error(`Unexpected dependency: ${name}`);
}, backendModule, backendModule.exports);
const { normalizeFloodAreaData } = backendModule.exports;
const input = {
  name: "Vùng kiểm thử", description: "Mô tả", source: "Contract test",
  areaType: "flood",
  geometry: { type: "polygon", points: [
    { latitude: 16, longitude: 108 }, { latitude: 16.02, longitude: 108 },
    { latitude: 16, longitude: 108.03 },
  ] },
};
const item = (type = "flood") => ({ id: "area-1", ...input, areaType: type });
const response = (data, status = 200) => new Response(JSON.stringify({ success: true, data }), {
  status, headers: { "Content-Type": "application/json" },
});
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
async function withHttp(handler, run) {
  globalThis.localStorage = { getItem: () => "contract-test-token" };
  globalThis.fetch = handler;
  try { await run(); } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
}

test("lists both API categories without obsolete status or severity", async () => {
  await withHttp(async () => response({ floodAreas: [item("flood"), { ...item("low_lying"), id: "area-2" }] }), async () => {
    const areas = await service.listAreas();
    assert.deepEqual(areas.map((a) => a.areaType), ["flood", "low_lying"]);
    assert.equal(types.AREA_TYPE_COLOR.flood, "#fdd835");
    assert.equal(types.AREA_TYPE_COLOR.low_lying, "#e53935");
  });
});

test("old missing, null and unsupported types remain editable and unclassified", async () => {
  const old = item(); delete old.areaType;
  await withHttp(async () => response({ floodAreas: [old, item(null), item("future")] }), async () => {
    assert.deepEqual((await service.listAreas()).map((a) => a.areaType), [null, null, null]);
  });
});

for (const type of ["flood", "low_lying"]) {
  test(`POST ${type} payload passes actual backend validation`, async () => {
    await withHttp(async (url, options) => {
      assert.equal(url, "https://contract.invalid/api/admin/flood-areas");
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      assert.equal(Object.hasOwn(body, "status"), false);
      assert.equal(Object.hasOwn(body, "severity"), false);
      const normalized = normalizeFloodAreaData(body);
      assert.equal(normalized.areaType, type);
      return response({ floodArea: { id: "new-id", ...normalized } }, 201);
    }, async () => {
      const saved = await service.createArea({ ...input, areaType: type, severity: "high", status: "active" });
      assert.equal(saved.areaType, type);
    });
  });
}

test("PATCH explicitly classifies an old record and preserves its identity", async () => {
  await withHttp(async (url, options) => {
    assert.equal(options.method, "PATCH");
    assert.ok(url.endsWith("/old%2Fid"));
    assert.deepEqual(JSON.parse(options.body), { areaType: "low_lying" });
    const normalized = normalizeFloodAreaData({ ...input, ...JSON.parse(options.body) });
    return response({ floodArea: { id: "old/id", ...normalized } });
  }, async () => {
    const saved = await service.updateArea("old/id", { areaType: "low_lying" });
    assert.equal(saved.id, "old/id");
    assert.equal(saved.areaType, "low_lying");
  });
});

test("form and service reject a missing category without issuing HTTP", async () => {
  assert.ok(types.validateArea({ ...input, areaType: "" }).length > 0);
  await withHttp(() => { throw new Error("HTTP must not be called"); }, async () => {
    await assert.rejects(service.createArea({ ...input, areaType: null }), (e) => e.status === 400);
    await assert.rejects(service.updateArea("id", { areaType: "future" }), (e) => e.status === 400);
  });
});

test("does not claim a successful classification if an old server ignores areaType", async () => {
  const old = item(); delete old.areaType;
  await withHttp(async () => response({ floodArea: old }, 201), async () => {
    await assert.rejects(service.createArea(input), /Máy chủ chưa xác nhận loại vùng/);
  });
});

test("rejects malformed API geometry and invalid form boundaries", async () => {
  await withHttp(async () => response({ floodAreas: [{ ...item(), geometry: { type: "polygon", points: [{ latitude: 91, longitude: 108 }] } }] }), async () => {
    await assert.rejects(service.listAreas(), /sai cấu trúc/);
  });
  assert.ok(types.validateArea({ ...input, geometry: { type: "polygon", points: [
    { latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 },
  ] } }).length > 0);
});

test("DELETE conflict does not offer or send an obsolete status update", async () => {
  let calls = 0;
  await withHttp(async (_url, options) => {
    calls++;
    assert.equal(options.method, "DELETE");
    return new Response(JSON.stringify({ success: false, message: "linked" }), { status: 409 });
  }, async () => {
    await assert.rejects(service.deleteArea("id"), (e) => e.status === 409 && !e.message.includes("ngừng hoạt động"));
  });
  assert.equal(calls, 1);
});

test("unauthenticated operations fail before HTTP", async () => {
  await withHttp(() => { throw new Error("HTTP must not be called"); }, async () => {
    globalThis.localStorage = { getItem: () => null };
    await assert.rejects(service.listAreas(), (e) => e.status === 401);
  });
});

test("dashboard uses linked active warnings, never obsolete area status or severity", () => {
  const areas = [item("flood"), { ...item("low_lying"), id: "area-2" }, { ...item(null), id: "unclassified" }];
  const ranked = stats.rankRiskAreas(areas, [
    { id: "a", areaId: "area-2", status: "active", severity: "low" },
    { id: "b", areaId: "area-2", status: "active", severity: "high" },
    { id: "c", areaId: "area-1", status: "active", severity: "critical" },
    { id: "d", areaId: "unclassified", status: "inactive", severity: "critical" },
  ]);
  assert.deepEqual(ranked.map((a) => [a.id, a.areaType, a.alertCount]), [
    ["area-2", "low_lying", 2], ["area-1", "flood", 1],
  ]);
  assert.deepEqual(stats.rankRiskAreas(areas, []), []);
});

test("timed-out POST is not retried; operator can issue a separate GET to verify", async () => {
  const methods = [];
  await withHttp(async (_url, options) => {
    methods.push(options.method);
    if (options.method === "POST") throw new DOMException("Request timed out", "AbortError");
    return response({ floodAreas: [item("flood")] });
  }, async () => {
    await assert.rejects(service.createArea(input), (e) =>
      e.status === 504 && e.message.includes("refresh"),
    );
    assert.deepEqual(methods, ["POST"]);
    const areas = await service.listAreas();
    assert.equal(areas.length, 1);
    assert.deepEqual(methods, ["POST", "GET"]);
  });
});
