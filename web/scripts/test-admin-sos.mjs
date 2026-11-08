import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { parseApiList, parseApiDetail, parseApiSos, parseApiSummary, parseLocation } from "../src/pages/admin/sos/sosContract.ts";
import { createMockSos, filterMockSos, summarizeMockSos } from "../src/pages/admin/sos/sosMock.ts";

const item = (id = "sos-1") => ({ id, residentId: "resident-1", status: "submitted", urgency: "critical",
  location: { latitude: 16.05, longitude: 108.2 }, numberOfPeople: 3, note: "Need help",
  createdAt: "2026-11-07T01:00:00Z", updatedAt: "2026-11-07T02:00:00Z" });
const defaults = { condition: "all", from: "", to: "", search: "", sort: "newest" };

test("an explicitly empty API array is a successful empty list", () => {
  assert.deepEqual(parseApiList({ rescueRequests: [] }), []);
});
test("malformed list data is an error, never a successful empty list", () => {
  for (const value of [null, {}, { rescueRequests: null }, { rescueRequests: {} }, { rescueRequests: [null] }]) {
    assert.throws(() => parseApiList(value));
  }
  assert.throws(() => parseApiList({ rescueRequests: [item(), item()] }), /trùng/);
});
test("none of the legacy statuses is guessed to mean waiting or rescued", () => {
  for (const status of ["submitted", "received", "in_progress", "assisted", "cancelled", "future"]) {
    const parsed = parseApiSos({ ...item(), status, assignment: { rescueStaffId: "staff-1" } });
    assert.equal(parsed.condition, null);
    assert.equal(parsed.confirmedBy, null);
    assert.equal(parsed.completedAt, null);
  }
});
test("request updatedAt does not become GPS or completion time", () => {
  const parsed = parseApiDetail({ rescueRequest: item() });
  assert.equal(parsed.updatedAt, item().updatedAt);
  assert.equal(parsed.locationUpdatedAt, null);
  assert.equal(parsed.completedAt, null);
});
test("missing new-contract information stays missing instead of becoming fabricated identity or numbers", () => {
  const parsed = parseApiSos({ id: "sos-1", numberOfPeople: -1 });
  for (const key of ["senderName", "contact", "situations", "waterLevel", "numberOfPeople", "location"]) assert.equal(parsed[key], null);
});
test("coordinates require finite numbers and valid geographic ranges; zero is valid", () => {
  assert.deepEqual(parseLocation({ latitude: 0, longitude: 0 }), { latitude: 0, longitude: 0 });
  for (const point of [null, { latitude: "16", longitude: 108 }, { latitude: NaN, longitude: 108 },
    { latitude: 91, longitude: 108 }, { latitude: 16, longitude: 181 }, { latitude: 16, longitude: Infinity }]) {
    assert.equal(parseLocation(point), null);
  }
});
test("summary uses the server total and does not map old byStatus buckets", () => {
  assert.deepEqual(parseApiSummary({ total: 120, byStatus: { submitted: 20, assisted: 100 } }),
    { total: 120, active: null, rescued: null, source: "api" });
  assert.equal(parseApiSummary({ total: 0 }).total, 0);
  for (const total of [null, "0", NaN, Infinity, -1, 0.5]) assert.throws(() => parseApiSummary({ total }));
});
test("mock summary and rows use the same entire filtered dataset", () => {
  const source = createMockSos(new Date("2026-11-07T08:00:00Z"));
  assert.deepEqual(summarizeMockSos(source), { total: 3, active: 2, rescued: 1, source: "mock" });
  for (const condition of ["active", "rescued"]) {
    const rows = filterMockSos(source, { ...defaults, condition });
    const summary = summarizeMockSos(rows);
    assert.equal(summary.total, rows.length);
    assert.equal(summary.active + summary.rescued, rows.length);
    assert.ok(rows.every(row => row.condition === condition && row.source === "mock"));
  }
});
test("date bounds use Vietnam days and include the entire ending day", () => {
  const rows = ["2026-11-06T16:59:59.999Z", "2026-11-06T17:00:00.000Z", "2026-11-07T16:59:59.999Z", "2026-11-07T17:00:00.000Z"]
    .map((createdAt, i) => ({ ...createMockSos()[0], id: String(i), createdAt }));
  assert.deepEqual(filterMockSos(rows, { ...defaults, from: "2026-11-07", to: "2026-11-07", sort: "oldest" }).map(row => row.id), ["1", "2"]);
});
test("search and sorting work across all mock rows without mutating their source", () => {
  const source = createMockSos(new Date("2026-11-07T08:00:00Z"));
  assert.equal(filterMockSos(source, { ...defaults, search: "demo-sos-002" })[0].id, "DEMO-SOS-002");
  assert.equal(filterMockSos(source, { ...defaults, search: "NGƯỜI DÂN MẪU 03" }).length, 1);
  assert.equal(filterMockSos(source, { ...defaults, search: "not-found" }).length, 0);
  assert.equal(filterMockSos(source, { ...defaults, sort: "oldest" })[0].id, "DEMO-SOS-001");
  assert.equal(source[0].id, "DEMO-SOS-003");
});

// Exercise the actual API module and existing HTTP helper with stubbed HTTP; no live credentials.
const compileUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`;
const root = new URL("../src/pages/admin/sos/", import.meta.url);
const contractUrl = compileUrl(await readFile(new URL("sosContract.ts", root), "utf8"));
const httpUrl = compileUrl((await readFile(new URL("../src/api/http.ts", import.meta.url), "utf8"))
  .replace('import { API_URL } from "./authApi";', 'const API_URL = "https://contract.invalid/api";'));
const apiCode = (await readFile(new URL("sosApi.ts", root), "utf8"))
  .replaceAll("import.meta.env.DEV", "false").replaceAll("import.meta.env.VITE_ADMIN_SOS_MOCK", '"true"')
  .replace('"../../../api/http"', JSON.stringify(httpUrl)).replace('"./sosContract"', JSON.stringify(contractUrl));
const api = await import(compileUrl(apiCode));
const response = (data, status = 200) => new Response(JSON.stringify({ success: status === 200, data }), { status, headers: { "Content-Type": "application/json" } });
async function withHttp(handler, run) {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  globalThis.fetch = handler; globalThis.window = globalThis;
  try { await run(); } finally { globalThis.fetch = previousFetch; if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
}
test("API mode sends only documented GET requests and uses summary total rather than row count", async () => {
  const calls = [];
  await withHttp(async (url, options) => {
    calls.push(String(url)); assert.ok(!options.method || options.method === "GET");
    assert.equal(options.headers.Authorization, "Bearer unit-test-token");
    return String(url).endsWith("/summary") ? response({ total: 900 }) : response({ rescueRequests: [item()] });
  }, async () => {
    const result = await api.fetchSosList("unit-test-token", { ...defaults, sort: "oldest" });
    assert.equal(result.items.length, 1); assert.equal(result.summary.total, 900);
    assert.equal(result.source, "api"); assert.equal(api.SOS_MOCK_ENABLED, false);
  });
  assert.deepEqual(calls.sort(), ["https://contract.invalid/api/admin/rescue-requests/summary", "https://contract.invalid/api/admin/rescue-requests?sort=oldest"].sort());
});
test("unsupported API filters are rejected before any request is sent", async () => {
  await withHttp(() => { assert.fail("must not send a partial or invented query"); }, async () => {
    for (const filter of [{ condition: "active" }, { from: "2026-11-07" }, { search: "name" }])
      await assert.rejects(api.fetchSosList("unit-test-token", { ...defaults, ...filter }), /chờ API/);
  });
});
test("summary failure preserves successful rows and exposes an error instead of zero counts", async () => {
  await withHttp(async url => String(url).endsWith("/summary") ? response(null, 500) : response({ rescueRequests: [item()] }), async () => {
    const result = await api.fetchSosList("unit-test-token", defaults);
    assert.equal(result.items.length, 1); assert.equal(result.summary, null); assert.equal(result.summaryError.status, 500);
  });
});
test("list failure and malformed list data are errors, never mock or empty success", async () => {
  for (const result of [() => response(null, 500), () => response({ rescueRequests: {} })]) {
    await withHttp(async url => String(url).endsWith("/summary") ? response({ total: 20 }) : result(), async () => {
      await assert.rejects(api.fetchSosList("unit-test-token", defaults));
    });
  }
});
test("expired sessions, forbidden summary and missing details retain their distinct HTTP meanings", async () => {
  await assert.rejects(api.fetchSosSummary(null), error => error.status === 401);
  await withHttp(async url => String(url).endsWith("/summary") ? response(null, 403) : response({ rescueRequests: [item()] }), async () => {
    await assert.rejects(api.fetchSosList("unit-test-token", defaults), error => error.status === 403);
  });
  await withHttp(async () => response(null, 404), async () => {
    await assert.rejects(api.fetchSosDetail("unit-test-token", "missing"), error => error.status === 404);
  });
});
test("a detail response for a different SOS is rejected", async () => {
  await withHttp(async () => response({ rescueRequest: item("other") }), async () => {
    await assert.rejects(api.fetchSosDetail("unit-test-token", "expected"), /SOS khác/);
  });
});

test("explicit development mock keeps event timestamps stable across list, detail and refresh", async () => {
  const mockUrl = compileUrl(await readFile(new URL("sosMock.ts", root), "utf8"));
  const mockApiCode = (await readFile(new URL("sosApi.ts", root), "utf8"))
    .replaceAll("import.meta.env.DEV", "true").replaceAll("import.meta.env.VITE_ADMIN_SOS_MOCK", '"true"')
    .replace('"../../../api/http"', JSON.stringify(httpUrl)).replace('"./sosContract"', JSON.stringify(contractUrl))
    .replace('"./sosMock"', JSON.stringify(mockUrl));
  const mockApi = await import(compileUrl(mockApiCode));
  await withHttp(() => assert.fail("mock mode must not request live SOS data"), async () => {
    const list = await mockApi.fetchSosList("unit-test-token", defaults);
    const original = list.items.find(row => row.id === "DEMO-SOS-002");
    await new Promise(resolve => setTimeout(resolve, 10));
    const detail = await mockApi.fetchSosDetail("unit-test-token", original.id);
    const refreshed = await mockApi.fetchSosList("unit-test-token", { ...defaults, sort: "oldest" });
    for (const field of ["createdAt", "updatedAt", "locationUpdatedAt", "completedAt"]) {
      assert.equal(detail[field], original[field], field);
      assert.equal(refreshed.items.find(row => row.id === original.id)[field], original[field], field);
    }
    // A caller cannot mutate the shared snapshot used by subsequent screens.
    detail.note = "changed by test"; detail.situations.push("changed by test");
    const next = await mockApi.fetchSosDetail("unit-test-token", original.id);
    assert.equal(next.note, original.note);
    assert.deepEqual(next.situations, original.situations);
    assert.deepEqual(await mockApi.fetchSosSummary("unit-test-token"), { total: 3, active: 2, rescued: 1, source: "mock" });
  });
});
