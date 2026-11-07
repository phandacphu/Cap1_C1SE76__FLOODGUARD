import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// Optional browser QA. Install Playwright separately or point PLAYWRIGHT_MODULE at an existing installation.
// Starts isolated dev servers and a production preview; run the production build first.
// All API responses below are HTTP fixtures, not live integration results or real accounts.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const servers = [
  [5174, "true", false], [5175, "false", false], [5176, "false", true],
].map(([port, mock, preview]) => spawn(process.execPath,
  ["node_modules/vite/bin/vite.js", ...(preview ? ["preview"] : []), "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: webRoot, env: { ...process.env, VITE_API_URL: "http://127.0.0.1:5999/api", VITE_ADMIN_SOS_MOCK: mock }, stdio: "ignore" }));
try {
  await Promise.all([5174, 5175, 5176].map(async port => {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return; } catch { /* wait for startup */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Vite did not start on ${port}`);
  }));
} catch (error) { servers.forEach(server => server.kill()); throw error; }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader"] });
const evidence = process.env.SOS_EVIDENCE_DIR || fileURLToPath(new URL("../../docs/evidence/admin-sos/", import.meta.url));
await mkdir(evidence, { recursive: true });
const results = [];
const errors = [];
const item = (id = "API-SOS-01") => ({ id, residentId: "API-RESIDENT-01", status: "submitted", urgency: "high",
  location: { latitude: 16.05, longitude: 108.2 }, numberOfPeople: 3, note: "HTTP fixture for API-mode UI checks",
  createdAt: "2026-11-07T01:00:00Z", updatedAt: "2026-11-07T02:00:00Z" });

async function open(port = 5175, path = "/admin/sos", overrides = {}, session = "ADMIN") {
  // The QA container's outbound proxy uses a private CA. This applies only to this isolated fixture browser.
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, timezoneId: "Asia/Ho_Chi_Minh", ignoreHTTPSErrors: true });
  if (session) await context.addInitScript(role => {
    localStorage.setItem("floodguard_token", "synthetic-ui-fixture-not-a-backend-token");
    localStorage.setItem("floodguard_user", JSON.stringify({ id: "synthetic-ui-fixture", fullName: "UI fixture", role }));
  }, session);
  const state = { listStatus: 200, summaryStatus: 200, detailStatus: 200, total: 40,
    items: [item()], detail: item(), listDelay: 0, failNetwork: false, ...overrides };
  const calls = [];
  await context.route("http://127.0.0.1:5999/api/**", async route => {
    const request = route.request(); const url = new URL(request.url());
    calls.push({ path: url.pathname + url.search, method: request.method() });
    assert.equal(request.method(), "GET", "Admin SOS must never mutate API data");
    if (state.failNetwork) return route.abort("connectionrefused");
    let status = 200, data = {};
    if (url.pathname === "/api/admin/rescue-requests/summary") { status = state.summaryStatus; data = { total: state.total, byStatus: { submitted: 25, assisted: 15 } }; }
    else if (url.pathname === "/api/admin/rescue-requests") {
      status = state.listStatus;
      data = { rescueRequests: structuredClone(state.bySort ? state.bySort[url.searchParams.get("sort")] : state.items) };
      const delay = state.bySortDelay?.[url.searchParams.get("sort")] ?? state.listDelay;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    } else if (url.pathname.startsWith("/api/admin/rescue-requests/")) { status = state.detailStatus; data = { rescueRequest: state.detail }; }
    else if (url.pathname === "/api/flood-alerts/active") data = { floodAlerts: [] };
    else if (url.pathname === "/api/flood-areas") data = { floodAreas: [] };
    else if (url.pathname === "/api/safe-locations") data = { safeLocations: [] };
    else if (url.pathname === "/api/admin/users") data = { users: [] };
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: status === 200, message: status === 200 ? "OK" : "Fixture error", data }) });
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}${path}`);
  return { context, page, state, calls };
}
const visible = locator => locator.waitFor({ state: "visible", timeout: 10000 });
async function shot(page, name) {
  if (await page.locator(".leaflet-container").count()) {
    await page.waitForFunction(() => document.querySelector(".leaflet-tile-loaded") ||
      document.body.innerText.includes("Không tải được một phần nền bản đồ"), null, { timeout: 8000 }).catch(() => {});
  }
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
}
async function run(name, work) {
  try { await work(); results.push({ name, result: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, result: "FAIL", error: error.message }); throw error; }
}

try {
  await run("mock list, consistent statistics and two business labels", async () => {
    const { context, page, calls } = await open(5174);
    await visible(page.getByText("DEMO-SOS-003", { exact: true }));
    await visible(page.getByText("DỮ LIỆU MẪU · CHỈ MÔI TRƯỜNG PHÁT TRIỂN", { exact: true }));
    assert.equal(await page.locator("tbody tr").count(), 3);
    assert.equal(await page.getByRole("region", { name: "Thống kê SOS" }).count(), 1);
    const createdAt = await page.locator("tbody tr").filter({ hasText: "DEMO-SOS-002" }).locator("td").nth(3).innerText();
    await shot(page, "01-mock-list");
    await page.getByLabel("Tình trạng SOS", { exact: true }).selectOption("rescued");
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    await visible(page.getByText("1 dòng hiển thị · Đã áp dụng bộ lọc", { exact: true }));
    assert.equal(await page.locator("tbody tr").count(), 1);
    const stats = page.getByRole("region", { name: "Thống kê SOS" });
    assert.match(await stats.innerText(), /Tổng số SOS\s+1/);
    assert.match(await stats.innerText(), /Còn hoạt động \/ chờ cứu\s+0/);
    await shot(page, "02-mock-filter");
    await page.getByRole("link", { name: "Xem chi tiết SOS DEMO-SOS-002" }).click();
    await visible(page.getByRole("heading", { name: "Kết quả cứu hộ · Đã cứu" }));
    await visible(page.getByText("16.038000, 108.215000", { exact: true }));
    await visible(page.getByRole("region", { name: "Bản đồ vị trí SOS" }));
    const detailCreatedAt = page.getByText("Thời gian gửi", { exact: true }).locator("..").locator("dd");
    assert.equal(await detailCreatedAt.innerText(), createdAt, "navigation must preserve the SOS creation timestamp");
    await page.getByRole("button", { name: "Làm mới chi tiết", exact: true }).click();
    await page.getByRole("button", { name: "Làm mới chi tiết", exact: true }).waitFor({ state: "visible" });
    assert.equal(await detailCreatedAt.innerText(), createdAt, "refresh must preserve the SOS creation timestamp");
    assert.equal(await page.getByRole("button", { name: /Tiếp nhận|Phân công|Xác nhận đã cứu|Xóa SOS|Hủy SOS/ }).count(), 0);
    await shot(page, "03-mock-rescued-detail");
    assert.equal(calls.length, 0, "mock SOS must not mix in real SOS endpoints");
    await context.close();
  });
  await run("mock no matches and invalid dates", async () => {
    const { context, page } = await open(5174);
    await visible(page.getByText("DEMO-SOS-003", { exact: true }));
    await page.getByLabel("Mã SOS, tên hoặc số điện thoại", { exact: true }).fill("not-found");
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    await visible(page.getByRole("heading", { name: "Không có kết quả theo bộ lọc" }));
    await shot(page, "04-mock-no-matches");
    await page.getByLabel("Gửi từ ngày", { exact: true }).fill("2026-11-08");
    await page.getByLabel("Đến hết ngày", { exact: true }).fill("2026-11-07");
    assert.equal(await page.getByRole("button", { name: "Áp dụng", exact: true }).isDisabled(), true);
    await context.close();
  });
  await run("API loading, summary total, disabled unsupported filters and detail location refresh", async () => {
    const { context, page, state } = await open(5175, "/admin/sos", { listDelay: 1000 });
    await visible(page.getByRole("status").filter({ hasText: "Đang tải dữ liệu SOS" }));
    await visible(page.getByText("API-SOS-01", { exact: true }));
    const stats = page.getByRole("region", { name: "Thống kê SOS" });
    assert.match(await stats.innerText(), /Tổng số SOS\s+40/);
    for (const name of ["Tình trạng SOS", "Gửi từ ngày", "Đến hết ngày", "Mã SOS, tên hoặc số điện thoại"]) assert.equal(await page.getByLabel(name, { exact: true }).isDisabled(), true);
    assert.equal(await page.getByText("Đã gửi — chờ cứu hộ", { exact: true }).count(), 0, "legacy submitted must not be mapped");
    await shot(page, "05-api-contract-pending");
    await page.getByRole("link", { name: "Xem chi tiết SOS API-SOS-01" }).click();
    await visible(page.getByText("16.050000, 108.200000", { exact: true }));
    state.detail = { ...item(), location: { latitude: 16.06, longitude: 108.21 } };
    await page.getByRole("button", { name: "Làm mới chi tiết", exact: true }).click();
    await visible(page.getByText("16.060000, 108.210000", { exact: true }));
    state.failNetwork = true;
    await page.getByRole("button", { name: "Làm mới chi tiết", exact: true }).click();
    await visible(page.getByRole("alert"));
    await visible(page.getByText("16.060000, 108.210000", { exact: true }));
    await visible(page.getByRole("status").filter({ hasText: "Đang giữ thông tin và vị trí" }));
    await shot(page, "06-api-refresh-error-keeps-location");
    await context.close();
  });
  await run("API empty is distinct from load error; retry recovers", async () => {
    const { context, page, state } = await open(5175, "/admin/sos", { listStatus: 500 });
    await visible(page.getByRole("alert"));
    assert.equal(await page.getByRole("heading", { name: "Không có SOS", exact: true }).count(), 0);
    assert.equal(await page.getByText("DEMO-SOS-003", { exact: true }).count(), 0);
    assert.doesNotMatch(await page.getByRole("region", { name: "Thống kê SOS" }).innerText(), /Tổng số SOS\s+0/);
    await shot(page, "07-api-load-error");
    state.listStatus = 200; state.items = []; state.total = 0;
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await visible(page.getByRole("heading", { name: "Không có SOS", exact: true }));
    await shot(page, "08-api-empty"); await context.close();
  });
  await run("summary-only failure keeps rows and exposes a separate retryable statistics error", async () => {
    const { context, page } = await open(5175, "/admin/sos", { summaryStatus: 500 });
    await visible(page.getByText("API-SOS-01", { exact: true }));
    await visible(page.getByRole("alert").filter({ hasText: "Không tải được thống kê SOS" }));
    assert.doesNotMatch(await page.getByRole("region", { name: "Thống kê SOS" }).innerText(), /Tổng số SOS\s+0/);
    await context.close();
  });
  await run("401, 403 and 404 have distinct states and hide cached protected data", async () => {
    for (const status of [401, 403, 404]) {
      const { context, page, state } = await open(5175, "/admin/sos/API-SOS-01");
      await visible(page.getByText("16.050000, 108.200000", { exact: true }));
      state.detailStatus = status;
      await page.getByRole("button", { name: "Làm mới chi tiết", exact: true }).click();
      await visible(page.getByRole("alert"));
      assert.equal(await page.getByText("16.050000, 108.200000", { exact: true }).count(), 0);
      if (status === 401) {
        await page.getByRole("button", { name: "Đăng nhập lại", exact: true }).click();
        await page.waitForURL("**/login");
        assert.equal(await page.evaluate(() => localStorage.getItem("floodguard_token")), null);
      } else if (status === 403) await visible(page.getByText("Bạn không có quyền xem dữ liệu Admin SOS.", { exact: true }));
      else await visible(page.getByRole("link", { name: "Về danh sách SOS", exact: true }));
      await context.close();
    }
  });
  await run("an invalid location retains the SOS and shows a safe map fallback", async () => {
    const { context, page } = await open(5175, "/admin/sos/API-SOS-01", { detail: { ...item(), location: { latitude: 91, longitude: 108 } } });
    await visible(page.getByText("Chưa có tọa độ hợp lệ", { exact: true }));
    await visible(page.getByRole("heading", { name: "Thông tin SOS", exact: true }));
    assert.equal(await page.locator(".leaflet-container").count(), 0); await context.close();
  });
  await run("basemap failure keeps the marker and coordinates and has a separate retry", async () => {
    const { context, page } = await open(5174, "/admin/sos");
    await context.route("https://*.tile.openstreetmap.org/**", route => route.abort("connectionrefused"));
    await page.goto("http://127.0.0.1:5174/admin/sos/DEMO-SOS-003");
    await visible(page.getByRole("status").filter({ hasText: "Không tải được một phần nền bản đồ" }));
    await visible(page.getByText("16.061000, 108.201000", { exact: true }));
    assert.ok(await page.locator(".leaflet-interactive").count() > 0);
    await visible(page.getByRole("button", { name: "Thử lại nền bản đồ", exact: true }));
    await context.close();
  });
  await run("obsolete sort responses cannot overwrite the latest request", async () => {
    const { context, page } = await open(5175, "/admin/sos", {
      bySort: { newest: [item("NEWEST-RESULT")], oldest: [item("OLDEST-RESULT")] }, bySortDelay: { newest: 300, oldest: 1000 },
    });
    await visible(page.getByText("NEWEST-RESULT", { exact: true }));
    const olderResponse = page.waitForResponse(response => response.url().endsWith("?sort=oldest"));
    await page.getByLabel("Thời gian gửi", { exact: true }).selectOption("oldest");
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    await page.getByLabel("Thời gian gửi", { exact: true }).selectOption("newest");
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Đang tải...", exact: true }).isDisabled(), true);
    await olderResponse;
    await visible(page.getByText("NEWEST-RESULT", { exact: true }));
    assert.equal(await page.getByText("OLDEST-RESULT", { exact: true }).count(), 0); await context.close();
  });
  await run("Admin route guards reject signed-out and Rescue sessions", async () => {
    const anonymous = await open(5175, "/admin/sos", {}, null);
    await anonymous.page.waitForURL("**/login"); assert.equal(anonymous.calls.length, 0); await anonymous.context.close();
    const rescue = await open(5175, "/admin/sos/API-SOS-01", {}, "RESCUE_STAFF");
    await rescue.page.waitForURL("**/unauthorized"); assert.equal(rescue.calls.length, 0); await rescue.context.close();
  });
  await run("mobile list and detail remain within the viewport", async () => {
    const { context, page } = await open(5174);
    await page.setViewportSize({ width: 390, height: 844 });
    await visible(page.getByText("DEMO-SOS-003", { exact: true }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await shot(page, "09-mobile-list");
    await page.goto("http://127.0.0.1:5174/admin/sos/DEMO-SOS-003");
    await visible(page.getByText("16.061000, 108.201000", { exact: true }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await shot(page, "10-mobile-detail"); await context.close();
  });
  await run("dashboard SOS errors show a retry and no sample statistics", async () => {
    const { context, page, state } = await open(5175, "/admin/dashboard", { summaryStatus: 500 });
    await visible(page.getByRole("alert").filter({ hasText: "Không tải được thống kê SOS" }));
    await visible(page.getByText("Chưa tải được thống kê SOS", { exact: true }));
    assert.equal(await page.getByRole("heading", { name: "SOS theo thời gian (24h)", exact: true }).count(), 0);
    await shot(page, "11-dashboard-sos-error");
    state.summaryStatus = 200;
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await visible(page.getByText("Từ thống kê tổng hợp SOS", { exact: true }));
    await context.close();
  });
  await run("dashboard mock statistics are explicitly labelled and do not request real SOS data", async () => {
    const { context, page, calls } = await open(5174, "/admin/dashboard");
    await visible(page.getByText("DỮ LIỆU MẪU · CHỈ MÔI TRƯỜNG PHÁT TRIỂN", { exact: true }));
    await visible(page.getByText("Toàn bộ dữ liệu mẫu · Chỉ phát triển", { exact: true }));
    assert.match(await page.getByRole("region", { name: "Thống kê SOS" }).innerText(), /Tổng số SOS\s+3/);
    assert.equal(calls.filter(call => call.path.startsWith("/api/admin/rescue-requests")).length, 0);
    await context.close();
  });
  await run("production ignores the mock opt-in used during its build", async () => {
    const { context, page, calls } = await open(5176);
    await visible(page.getByText("API-SOS-01", { exact: true }));
    assert.equal(await page.getByText("DEMO-SOS-003", { exact: true }).count(), 0);
    assert.equal(await page.getByLabel("Tình trạng SOS", { exact: true }).isDisabled(), true);
    assert.ok(calls.some(call => call.path.endsWith("/summary"))); await context.close();
  });
  assert.deepEqual(errors, [], "no unhandled browser errors");
} finally {
  await writeFile(`${evidence}/browser-results.json`, JSON.stringify({ apiMode: "HTTP fixtures, not live backend", results, browserErrors: errors }, null, 2));
  await browser.close();
  servers.forEach(server => server.kill());
}
