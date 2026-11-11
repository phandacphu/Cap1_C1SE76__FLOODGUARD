import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { parseApiList, parseApiDetail, parseApiSos, parseApiSummary, parseLocation } from "../src/pages/admin/sos/sosContract.ts";
import { createMockSos, filterMockSos, summarizeMockSos } from "../src/pages/admin/sos/sosMock.ts";

const item = (id = "sos-1") => ({ id, residentId: "resident-1", state: "active", status: "submitted", situations: ["trapped"], initialLocation: { latitude: 16.04, longitude: 108.19 }, locationCapturedAt: "2026-11-07T01:59:00Z", locationReceivedAt: "2026-11-07T02:00:00Z",
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
test("legacy status text never overrides documented v2 state", () => {
  for (const status of ["submitted", "received", "in_progress", "assisted", "cancelled", "future"]) {
    const parsed = parseApiSos({ ...item(), state: "legacy_other", status, assignment: { rescueStaffId: "staff-1" } });
    assert.equal(parsed.condition, "legacy_other");
    assert.equal(parsed.confirmedBy, null);
    assert.equal(parsed.completedAt, null);
  }
  assert.throws(() => parseApiSos({ ...item(), state: undefined }), /state/);
  assert.throws(() => parseApiSos({ ...item(), state: "submitted" }), /state/);
});
test("request updatedAt does not become GPS or completion time", () => {
  const parsed = parseApiDetail({ rescueRequest: item() });
  assert.equal(parsed.updatedAt, item().updatedAt);
  assert.equal(parsed.locationUpdatedAt, null);
  assert.equal(parsed.completedAt, null);
});
test("missing new-contract information stays missing instead of becoming fabricated identity or numbers", () => {
  const parsed = parseApiSos({ id: "sos-1", state: "active", numberOfPeople: -1 });
  for (const key of ["senderName", "contact", "situations", "waterLevel", "numberOfPeople", "location"]) assert.equal(parsed[key], null);
});
test("coordinates require finite numbers and valid geographic ranges; zero is valid", () => {
  assert.deepEqual(parseLocation({ latitude: 0, longitude: 0 }), { latitude: 0, longitude: 0 });
  for (const point of [null, { latitude: "16", longitude: 108 }, { latitude: NaN, longitude: 108 },
    { latitude: 91, longitude: 108 }, { latitude: 16, longitude: 181 }, { latitude: 16, longitude: Infinity }]) {
    assert.equal(parseLocation(point), null);
  }
});
test("v2 summary requires all state buckets and never trusts legacy byStatus", () => {
  assert.deepEqual(parseApiSummary({ total: 7, active: 3, rescued: 2, legacyOther: 2 }),
    { total: 7, active: 3, rescued: 2, legacyOther: 2, source: "api" });
  assert.equal(parseApiSummary({ total: 0, active: 0, rescued: 0, legacyOther: 0 }).total, 0);
  assert.throws(() => parseApiSummary({ total: 7, byStatus: { submitted: 3, assisted: 4 } }));
  assert.throws(() => parseApiSummary({ total: 7, active: 3, rescued: 2, legacyOther: 1 }), /khớp/);
  for (const total of [null, "0", NaN, Infinity, -1, 0.5])
    assert.throws(() => parseApiSummary({ total, active: 0, rescued: 0, legacyOther: 0 }));
});
test("mock summary and rows use the same entire filtered dataset", () => {
  const source = createMockSos(new Date("2026-11-07T08:00:00Z"));
  assert.deepEqual(summarizeMockSos(source), { total: 3, active: 2, rescued: 1, legacyOther: 0, source: "mock" });
  for (const condition of ["active", "rescued"]) {
    const rows = filterMockSos(source, { ...defaults, condition });
    const summary = summarizeMockSos(rows);
    assert.equal(summary.total, rows.length);
    assert.equal(summary.active + summary.rescued + summary.legacyOther, rows.length);
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
  assert.equal(filterMockSos(source, { ...defaults, search: "DEMO-RESIDENT-03" }).length, 1);
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
test("API mode sends only documented GETs and uses v2 summary with the same filters", async () => {
  const calls = [];
  await withHttp(async (url, options) => {
    calls.push(String(url)); assert.ok(!options.method || options.method === "GET");
    assert.equal(options.headers.Authorization, "Bearer unit-test-token");
    return String(url).includes("/summary") ? response({ total: 9, active: 5, rescued: 3, legacyOther: 1 })
      : response({ rescueRequests: [item()] });
  }, async () => {
    const result = await api.fetchSosList("unit-test-token", { ...defaults, sort: "oldest" });
    assert.equal(result.items.length, 1);
    assert.equal(result.summary.total, 9);
    assert.equal(result.summary.legacyOther, 1);
    assert.equal(result.summaryError, null);
    assert.equal(result.source, "api"); assert.equal(api.SOS_MOCK_ENABLED, false);
  });
  assert.deepEqual(calls.sort(), [
    "https://contract.invalid/api/admin/rescue-requests/summary?sort=oldest",
    "https://contract.invalid/api/admin/rescue-requests?sort=oldest",
  ].sort());
});
test("v2 state/date/sort filters are sent to both endpoints; text search stays local", async () => {
  const calls = [];
  await withHttp(async (url, options) => {
    calls.push(new URL(url));
    assert.ok(!options.method || options.method === "GET");
    return String(url).includes("/summary") ? response({ total: 1, active: 1, rescued: 0, legacyOther: 0 })
      : response({ rescueRequests: [item()] });
  }, async () => {
    const data = await api.fetchSosList("unit-test-token", { ...defaults, condition: "active", from: "2026-11-07", to: "2026-11-07", search: "not-an-api-filter" });
    assert.equal(data.items.length, 1);
  });
  assert.equal(calls.length, 2);
  for (const url of calls) {
    assert.equal(url.searchParams.get("state"), "active");
    assert.equal(url.searchParams.get("from"), "2026-11-06T17:00:00.000Z");
    assert.equal(url.searchParams.get("to"), "2026-11-07T16:59:59.999Z");
    assert.equal(url.searchParams.get("sort"), "newest");
    assert.equal(url.searchParams.has("search"), false);
  }
});
test("summary failure preserves successful rows and exposes an error instead of zero counts", async () => {
  await withHttp(async url => String(url).includes("/summary") ? response(null, 500) : response({ rescueRequests: [item()] }), async () => {
    const result = await api.fetchSosList("unit-test-token", defaults);
    assert.equal(result.items.length, 1); assert.equal(result.summary, null); assert.equal(result.summaryError.status, 500);
  });
});
test("list failure and malformed list data are errors, never mock or empty success", async () => {
  for (const result of [() => response(null, 500), () => response({ rescueRequests: {} })]) {
    await withHttp(async url => String(url).includes("/summary") ? response({ total: 20, active: 10, rescued: 9, legacyOther: 1 }) : result(), async () => {
      await assert.rejects(api.fetchSosList("unit-test-token", defaults));
    });
  }
});
test("expired sessions, forbidden summary and missing details retain their distinct HTTP meanings", async () => {
  await assert.rejects(api.fetchSosSummary(null), error => error.status === 401);
  await withHttp(async url => String(url).includes("/summary") ? response(null, 403) : response({ rescueRequests: [item()] }), async () => {
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
    assert.deepEqual(await mockApi.fetchSosSummary("unit-test-token"), { total: 3, active: 2, rescued: 1, legacyOther: 0, source: "mock" });
  });
});


test("summary 500 returns fresh SOS rows (including newly rescued) and unknown statistics", async () => {
  const changed = { ...item("SOS-RESCUED-NEW"), state: "rescued", status: "completed", completedBy: "staff-2", completedAt: "2026-11-07T03:00:00Z" };
  await withHttp(async url => String(url).includes("/summary") ? response(null, 500) : response({ rescueRequests: [changed] }), async () => {
    const data = await api.fetchSosList("unit-test-token", defaults);
    assert.equal(data.items[0].id, "SOS-RESCUED-NEW");
    assert.equal(data.items[0].condition, "rescued");
    assert.equal(data.summary, null);
    assert.equal(data.summaryError.status, 500);
  });
});

test("401/403 from either GET rejects immediately, before its delayed peer finishes", async () => {
  for (const status of [401, 403]) for (const forbiddenSide of ["summary", "list"]) {
    let release;
    await withHttp(url => {
      const side = String(url).includes("/summary") ? "summary" : "list";
      if (side === forbiddenSide) return Promise.resolve(response(null, status));
      return new Promise(resolve => { release = resolve; });
    }, async () => {
      const pending = api.fetchSosList("unit-test-token", defaults);
      try {
        await assert.rejects(Promise.race([
          pending,
          new Promise((_, reject) => setTimeout(() => reject(new Error("WAITED_FOR_SLOW_PEER")), 300)),
        ]), error => error.status === status);
      } finally {
        assert.equal(typeof release, "function");
        release(forbiddenSide === "summary" ? response({ rescueRequests: [item()] }) :
          response({ total: 1, active: 1, rescued: 0, legacyOther: 0 }));
      }
      await assert.rejects(pending, error => error.status === status);
    });
  }
});

test("list 500 waits for possible later authorization failure from summary, with 403 taking priority", async () => {
  let releaseSummary;
  await withHttp(url => String(url).includes("/summary")
    ? new Promise(resolve => { releaseSummary = resolve; })
    : Promise.resolve(response(null, 500)), async () => {
    const pending = api.fetchSosList("unit-test-token", defaults);
    // This test deliberately defers summary to validate priority, not elapsed time.
    await Promise.resolve();
    releaseSummary(response(null, 403));
    await assert.rejects(pending, error => error.status === 403);
  });
});
