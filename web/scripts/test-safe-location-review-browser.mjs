/**
 * PR #134 browser interaction QA. HTTP FIXTURES ONLY. NO REQUESTS TO RENDER.
 * Uses an isolated Vite dev server at 5178 with API URL http://127.0.0.1:5999/api.
 * Requires Playwright and a Chromium install; never sends real credentials/data.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const web = fileURLToPath(new URL("../", import.meta.url));
const evidence = process.env.SAFE_REVIEW_EVIDENCE_DIR || fileURLToPath(new URL("../../docs/evidence/admin-safe-location/pr134-review/", import.meta.url));
const port = Number(process.env.SAFE_REVIEW_PORT || 5178);
const server = spawn(process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: web, stdio: "ignore", env: { ...process.env, VITE_API_URL: "http://127.0.0.1:5999/api" } });
const results = [];
const A = { id: "TEST-QA-A", name: "TEST ONLY - QA A", address: "QA Address A", type: "shelter", location: { latitude: 16.0544, longitude: 108.2022 }, description: "Fixture A description", createdAt: null, updatedAt: null };
const B = { ...A, id: "TEST-QA-B", name: "TEST ONLY - QA B", description: "Fixture B description", location: { latitude: 16.043, longitude: 108.183 } };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return; } catch { /* Vite boot */ }
    await delay(100);
  }
  throw new Error(`Isolated Vite port ${port} did not start`);
}
let browser;
async function open(initial = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, timezoneId: "Asia/Ho_Chi_Minh" });
  await context.addInitScript(() => {
    localStorage.setItem("floodguard_token", "TEST-ONLY-PLAYWRIGHT-NOT-REAL-JWT");
    localStorage.setItem("floodguard_user", JSON.stringify({ id: "TEST-ONLY", role: "ADMIN", fullName: "TEST ONLY QA" }));
  });
  // Prevent noisy unrelated tile errors in offline fixture runs.
  await context.route(/https:\/\/.*\.tile\.openstreetmap\.org\/.*/, route => route.abort());
  const state = { rows: [structuredClone(A), structuredClone(B)], calls: [], listDelay: 0,
    detailStatus: 200, patchStatus: 200, deleteStatus: 200, postStatus: 201,
    postLost: false, postCreatedId: "TEST-QA-C", ...initial };
  const apiPrefix = "http://127.0.0.1:5999/api/";
  await context.route(`${apiPrefix}**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;
    state.calls.push({ method, path, url: req.url() });
    let status = 200, data = {}, message = "fixture";
    if (path === "/api/admin/safe-locations" && method === "GET") {
      if (state.listDelay) await delay(state.listDelay);
      data = { safeLocations: structuredClone(state.rows) };
    } else if (path.startsWith("/api/admin/safe-locations/") && method === "GET") {
      status = state.detailStatus;
      const id = decodeURIComponent(path.split("/").at(-1));
      const row = state.rows.find(x => x.id === id);
      if (!row) status = 404;
      data = { safeLocation: row ? structuredClone(row) : null };
    } else if (path === "/api/admin/safe-locations" && method === "POST") {
      status = state.postStatus;
      if (status === 201 || state.postLost) {
        const fields = req.postDataJSON();
        const row = { ...fields, id: state.postCreatedId, createdAt: null, updatedAt: null };
        state.rows.push(row);
        data = { safeLocation: row };
      }
      if (state.postLost) return route.abort("connectionreset");
    } else if (path.startsWith("/api/admin/safe-locations/") && method === "PATCH") {
      status = state.patchStatus;
      const id = decodeURIComponent(path.split("/").at(-1));
      const index = state.rows.findIndex(x => x.id === id);
      if (status === 200 && index >= 0) {
        state.rows[index] = { ...state.rows[index], ...req.postDataJSON() };
        data = { safeLocation: structuredClone(state.rows[index]) };
      }
      if (status === 404) state.rows = state.rows.filter(x => x.id !== id);
    } else if (path.startsWith("/api/admin/safe-locations/") && method === "DELETE") {
      status = state.deleteStatus;
      const id = decodeURIComponent(path.split("/").at(-1));
      if (status === 200 || status === 404) state.rows = state.rows.filter(x => x.id !== id);
      if (status === 200) data = { id, deleted: true, deletedAt: "2026-11-13T00:00:00Z" };
    } else if (path === "/api/flood-alerts/active") data = { floodAlerts: [] };
    else if (path === "/api/flood-areas") data = { floodAreas: [] };
    else if (path === "/api/admin/users") data = { users: [] };
    else if (path === "/api/admin/rescue-requests/summary") data = { total: 0, active: 0, rescued: 0, legacyOther: 0 };
    else if (path === "/api/health") data = {};
    else { status = 404; message = "Unknown fixture route"; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: status >= 200 && status < 300, message, data }) });
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/admin/safe-locations`);
  await page.getByRole("button", { name: "Xem TEST ONLY - QA A" }).waitFor({ timeout: 10000 });
  return { context, page, state };
}
async function shot(page, name) { await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); }
async function run(name, fn) {
  try { await fn(); results.push({ name, result: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, result: "FAIL", error: String(error) }); console.error(`FAIL ${name}`, error); throw error; }
}
async function edit(page, name = A.name) {
  await page.getByRole("button", { name: `Sửa ${name}` }).click();
  const form = page.getByRole("dialog", { name: "Sửa điểm an toàn" });
  await form.waitFor();
  await form.getByLabel("Tên địa điểm *").fill("TEST ONLY - QA UPDATED");
  return form;
}

try {
  await ready();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  await mkdir(evidence, { recursive: true });
  await run("same ID selection preserves detail", async () => {
    const { context, page, state } = await open();
    await page.getByRole("button", { name: "Xem TEST ONLY - QA A" }).click();
    await page.getByText("Fixture A description").waitFor();
    const before = state.calls.filter(c => c.method === "GET" && c.path.endsWith("/TEST-QA-A")).length;
    await page.getByRole("button", { name: "Xem TEST ONLY - QA A" }).click();
    await page.getByText("Fixture A description").waitFor();
    assert.equal(state.calls.filter(c => c.method === "GET" && c.path.endsWith("/TEST-QA-A")).length, before);
    await shot(page, "01-select-again"); await context.close();
  });
  await run("detail 500 shows retry rather than infinite loading", async () => {
    const { context, page, state } = await open({ detailStatus: 500 });
    await page.getByRole("button", { name: "Xem TEST ONLY - QA B" }).click();
    await page.getByRole("button", { name: "Thử lại chi tiết" }).waitFor();
    assert.equal(await page.getByText("Đang tải chi tiết địa điểm theo ID…").count(), 0);
    await shot(page, "02-detail-error");
    state.detailStatus = 200;
    await page.getByRole("button", { name: "Thử lại chi tiết" }).click();
    await page.getByText("Fixture B description").waitFor();
    await context.close();
  });
  await run("click row and green pin opens same detail by ID", async () => {
    const { context, page } = await open();
    await page.getByRole("button", { name: "Xem TEST ONLY - QA A" }).click();
    await page.getByText("Fixture A description").waitFor();
    const markers = page.locator(".leaflet-interactive");
    await markers.last().click({ force: true });
    await page.getByText("Fixture B description").waitFor();
    await shot(page, "03-row-pin-sync"); await context.close();
  });
  await run("GET detail 403 on refresh beats delayed list 200", async () => {
    const { context, page, state } = await open();
    await page.getByRole("button", { name: "Xem TEST ONLY - QA A" }).click();
    await page.getByText("Fixture A description").waitFor();
    state.listDelay = 750;
    state.detailStatus = 403;
    await page.getByRole("button", { name: "Làm mới" }).click();
    await page.getByText(/Bạn không có quyền quản lý điểm an toàn/).waitFor();
    await delay(900);
    assert.equal(await page.getByRole("button", { name: "Xem TEST ONLY - QA A" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "+ Thêm địa điểm" }).isDisabled(), true);
    await shot(page, "04-403-late-list"); await context.close();
  });
  await run("PATCH 401 hides protected list and closes edit dialog", async () => {
    const { context, page } = await open({ patchStatus: 401 });
    const form = await edit(page);
    await form.getByRole("button", { name: "Lưu thay đổi" }).click();
    await page.getByText("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Xem TEST ONLY - QA A" }).count(), 0);
    assert.equal(await page.getByRole("dialog", { name: "Sửa điểm an toàn" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "+ Thêm địa điểm" }).isDisabled(), true);
    await shot(page, "03-patch-401"); await context.close();
  });
  await run("DELETE 403 closes confirmation and blocks further write", async () => {
    const { context, page } = await open({ deleteStatus: 403 });
    await page.getByRole("button", { name: `Xóa ${A.name}` }).click();
    await page.getByRole("dialog", { name: "Xóa điểm an toàn?" }).getByRole("button", { name: "Xóa điểm" }).click();
    await page.getByText(/Bạn không có quyền quản lý điểm an toàn/).waitFor();
    assert.equal(await page.getByRole("dialog", { name: "Xóa điểm an toàn?" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Xem TEST ONLY - QA A" }).count(), 0);
    await shot(page, "04-delete-403"); await context.close();
  });
  await run("lost POST response requires list comparison and blocks a duplicate", async () => {
    const { context, page, state } = await open({ postLost: true });
    await page.getByRole("button", { name: "+ Thêm địa điểm" }).click();
    const form = page.getByRole("dialog", { name: "Thêm điểm an toàn" });
    await form.getByLabel("Tên địa điểm *").fill("TEST ONLY - QA C");
    await form.getByLabel("Địa chỉ *").fill("QA Address C");
    await form.getByLabel("Loại địa điểm *").selectOption("school");
    await form.getByLabel("Vĩ độ *").fill("16.1");
    await form.getByLabel("Kinh độ *").fill("108.1");
    await form.getByRole("button", { name: "Thêm địa điểm" }).click();
    await page.getByText(/ID mới khớp đủ trường/).waitFor({ timeout: 15000 });
    assert.equal(state.calls.filter(c => c.method === "POST").length, 1);
    assert.equal(await page.getByRole("button", { name: "+ Thêm địa điểm" }).isDisabled(), true);
    assert.equal(await form.getByRole("button", { name: "Thêm địa điểm" }).isDisabled(), true);
    await shot(page, "05-lost-post-reconciled"); await context.close();
  });
  await run("PATCH 404 removes old row and pin and closes edit dialog", async () => {
    const { context, page } = await open({ patchStatus: 404 });
    const form = await edit(page);
    await form.getByRole("button", { name: "Lưu thay đổi" }).click();
    await page.getByText(/Địa điểm không còn được cung cấp/).waitFor();
    assert.equal(await page.getByRole("button", { name: `Xem ${A.name}` }).count(), 0);
    assert.equal(await page.getByRole("dialog", { name: "Sửa điểm an toàn" }).count(), 0);
    await shot(page, "06-patch-404"); await context.close();
  });
  await run("DELETE 404 closes confirmation without success toast", async () => {
    const { context, page } = await open({ deleteStatus: 404 });
    await page.getByRole("button", { name: `Xóa ${A.name}` }).click();
    await page.getByRole("dialog", { name: "Xóa điểm an toàn?" }).getByRole("button", { name: "Xóa điểm" }).click();
    await page.getByText(/Địa điểm không còn được cung cấp/).waitFor();
    assert.equal(await page.getByRole("dialog", { name: "Xóa điểm an toàn?" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: `Xem ${A.name}` }).count(), 0);
    await shot(page, "07-delete-404"); await context.close();
  });
  await run("successful TEST fixture CRUD and search update table and map", async () => {
    const { context, page, state } = await open();
    const form = await edit(page);
    await form.getByRole("button", { name: "Lưu thay đổi" }).click();
    await page.getByRole("button", { name: "Xem TEST ONLY - QA UPDATED" }).waitFor();
    await page.getByLabel("Tìm theo tên hoặc địa chỉ").fill("QA UPDATED");
    assert.equal(await page.locator("tbody tr").count(), 1);
    await page.getByLabel("Tìm theo tên hoặc địa chỉ").fill("");
    await page.getByRole("button", { name: "Xóa TEST ONLY - QA UPDATED" }).click();
    await page.getByRole("dialog", { name: "Xóa điểm an toàn?" }).getByRole("button", { name: "Xóa điểm" }).click();
    await page.getByRole("button", { name: "Xem TEST ONLY - QA B" }).waitFor();
    assert.equal(state.rows.some(x => x.id === A.id), false);
    await shot(page, "08-fixture-crud"); await context.close();
  });
} finally {
  if (browser) await browser.close();
  server.kill();
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/results.json`, JSON.stringify({ note: "HTTP FIXTURES, NOT RENDER", results }, null, 2));
}
