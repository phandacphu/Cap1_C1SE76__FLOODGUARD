import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");

// Component interaction tests. TSX is executed through a small deterministic React hook
// harness; click/onSave/onConfirm call the real component's handlers, not an API adapter.
// Browser / Leaflet rendering is tested separately by the Playwright QA script.
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const Fragment = Symbol("Fragment");
let active = null;
const react = {
  useState(initial) { const r = active; const i = r.cursor++;
    if (!(i in r.hooks)) r.hooks[i] = typeof initial === "function" ? initial() : initial;
    return [r.hooks[i], (next) => { r.hooks[i] = typeof next === "function" ? next(r.hooks[i]) : next; r.dirty = true; }];
  },
  useRef(initial) { const r = active; const i = r.cursor++;
    if (!(i in r.hooks)) r.hooks[i] = { current: initial }; return r.hooks[i];
  },
  useCallback(fn, deps) { const r = active; const i = r.cursor++;
    const prev = r.hooks[i]; if (!prev || !sameDeps(prev.deps, deps)) r.hooks[i] = { value: fn, deps };
    return r.hooks[i].value;
  },
  useEffect(fn, deps) { const r = active; const i = r.cursor++;
    const prev = r.hooks[i];
    if (!prev || !sameDeps(prev.deps, deps)) r.effects.push({ i, fn, deps });
  },
};
function sameDeps(a, b) { return a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i])); }
function loadScreen() {
  const file = resolve(web, "src/pages/admin/safe-location/SafeLocationManagementScreen.tsx");
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: file, reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter(x => x.category === ts.DiagnosticCategory.Error).length ?? 0, 0);
  const fake = (name) => function FakeComponent() { throw new Error(`${name} need not mount in component logic test`); };
  const requireLocal = (id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment };
    if (id === "react-router-dom") return { Link: fake("Link") };
    if (id === "../../../api/http") return { ApiError };
    if (id === "../../../context/AuthContext") return { useAuth: () => ({ logout() {} }) };
    if (id === "./safeLocationTypes") return { locationTypeLabels: { shelter: "Điểm tránh trú", school: "Trường học", hospital: "Bệnh viện", community_center: "Nhà sinh hoạt cộng đồng", other: "Khác" },
      validCoordinates: p => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) };
    if (id === "./SafeLocationForm") return { SafeLocationForm: fake("SafeLocationForm") };
    if (id === "./SafeLocationMap") return { SafeLocationOverviewMap: fake("SafeLocationOverviewMap") };
    if (id === "../../../components/ui/ConfirmDialog") return { ConfirmDialog: fake("ConfirmDialog") };
    if (id === "../../../components/ui/Icon") return { Icon: fake("Icon") };
    if (id === "../../../components/layout/AdminHeader") return { AdminHeader: fake("AdminHeader") };
    if (id === "../../../components/layout/AppShell") return { AppShell: fake("AppShell") };
    if (id === "../../../components/layout/navConfig") return { ADMIN_NAV: [] };
    throw new Error(`Unexpected dependency: ${id}`);
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputText)(requireLocal, module, module.exports);
  return module.exports.default;
}
const Screen = loadScreen();
function renderer(source) {
  const r = { hooks: [], cursor: 0, effects: [], dirty: true, tree: null };
  const render = () => {
    if (!r.dirty) return;
    r.cursor = 0; r.effects = []; r.dirty = false; active = r;
    try { r.tree = Screen({ source }); } finally { active = null; }
    for (const { i, fn, deps } of r.effects) {
      r.hooks[i]?.cleanup?.();
      r.hooks[i] = { deps, cleanup: fn() };
    }
  };
  const tick = async () => { for (let i = 0; i < 8; i++) { render(); await Promise.resolve(); } render(); };
  const nodes = (predicate) => { const found = [];
    const visit = (node) => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object" || !("props" in node)) return;
      if (predicate(node)) found.push(node);
      visit(node.props.children);
    };
    visit(r.tree); return found;
  };
  const byLabel = text => nodes(x => x.props["aria-label"] === text)[0];
  const byText = text => nodes(x => x.type === "button" && x.props.children === text)[0];
  const panel = () => nodes(x => x.props["aria-label"] === "Chi tiết điểm an toàn")[0];
  const textOf = node => {
    if (Array.isArray(node)) return node.map(textOf).join(" ");
    if (node == null || typeof node === "boolean") return "";
    if (typeof node !== "object") return String(node);
    return textOf(node.props?.children);
  };
  return { tick, nodes, byLabel, byText, panel, textOf, get tree() { return r.tree; } };
}
const A = { id: "TEST-A", name: "TEST ONLY A", address: "A address", type: "shelter", description: "detail A", location: { latitude: 16, longitude: 108 }, createdAt: null, updatedAt: null };
const B = { ...A, id: "TEST-B", name: "TEST ONLY B" };
const fields = { name: "TEST ONLY C", address: "C address", type: "school", description: null, location: { latitude: 16.1, longitude: 108.1 } };
function defer() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  const state = { rows: [A, B], calls: [], listImpl: null, getImpl: null, saveImpl: null, removeImpl: null };
  const source = { demo: false,
    async list() { state.calls.push(["GET list"]); return state.listImpl ? state.listImpl() : [...state.rows]; },
    async get(id) { state.calls.push(["GET detail", id]); return state.getImpl ? state.getImpl(id) : state.rows.find(x => x.id === id) ?? Promise.reject(new ApiError("Not found", 404)); },
    async save(id, next) { state.calls.push(["WRITE", id]); return state.saveImpl ? state.saveImpl(id, next) : { ...A, ...next, id: id || "TEST-NEW" }; },
    async remove(id) { state.calls.push(["DELETE", id]); return state.removeImpl ? state.removeImpl(id) : undefined; },
  };
  return { state, source };
}
const click = async (r, node) => { assert.ok(node, "expected interactive control"); node.props.onClick({ stopPropagation() {} }); await r.tick(); };
const form = r => r.nodes(x => x.type?.name === "FakeComponent" && x.props.onSave)[0];
const deleteDialog = r => r.nodes(x => x.type?.name === "FakeComponent" && x.props.onConfirm)[0];

test("select A, reselect A by button/row preserves detail without redundant GET", async () => {
  const { source, state } = fixture(); const r = renderer(source); await r.tick();
  await click(r, r.byLabel("Xem TEST ONLY A"));
  assert.match(r.textOf(r.panel()), /detail A/);
  const reads = state.calls.filter(x => x[0] === "GET detail").length;
  await click(r, r.byLabel("Xem TEST ONLY A"));
  assert.match(r.textOf(r.panel()), /detail A/);
  assert.equal(state.calls.filter(x => x[0] === "GET detail").length, reads);
  const row = r.nodes(x => x.type === "tr" && x.props.className?.includes("cursor-pointer"))[0];
  await click(r, row);
  assert.match(r.textOf(r.panel()), /detail A/);
});

test("detail GET 500 terminates loading and explicit retry succeeds", async () => {
  const { source, state } = fixture(); let n = 0;
  state.getImpl = () => ++n === 1 ? Promise.reject(new ApiError("Server error", 500)) : Promise.resolve(A);
  const r = renderer(source); await r.tick(); await click(r, r.byLabel("Xem TEST ONLY A"));
  assert.match(r.textOf(r.panel()), /Không thể tải chi tiết/);
  assert.doesNotMatch(r.textOf(r.panel()), /Đang tải chi tiết/);
  await click(r, r.byText("Thử lại chi tiết"));
  assert.match(r.textOf(r.panel()), /detail A/);
  assert.equal(n, 2);
});

test("PATCH 401 locks data and closes editor; 403 DELETE locks confirm", async () => {
  for (const [action, code] of [["patch", 401], ["delete", 403]]) {
    const { source, state } = fixture();
    if (action === "patch") state.saveImpl = () => Promise.reject(new ApiError("denied", code));
    else state.removeImpl = () => Promise.reject(new ApiError("denied", code));
    const r = renderer(source); await r.tick();
    await click(r, r.byLabel(`${action === "patch" ? "Sửa" : "Xóa"} TEST ONLY A`));
    if (action === "patch") { const f = form(r); assert.ok(f); f.props.onSave(fields); }
    else { const d = deleteDialog(r); assert.ok(d); d.props.onConfirm(); }
    await r.tick();
    assert.equal(r.byLabel("Xem TEST ONLY A"), undefined, "protected list hidden");
    assert.equal(form(r), undefined, "form closed");
    assert.equal(deleteDialog(r), undefined, "delete dialog closed");
    assert.equal(r.byText("+ Thêm địa điểm").props.disabled, true);
    assert.match(r.textOf(r.tree), code === 401 ? /Đăng nhập lại/ : /không có quyền/);
  }
});

test("detail 403 arriving before delayed list 200 cannot restore rows or actions", async () => {
  const { source, state } = fixture(); const delayed = defer(); let lists = 0;
  state.listImpl = () => ++lists === 1 ? [...state.rows] : delayed.promise;
  const r = renderer(source); await r.tick();
  await click(r, r.byLabel("Xem TEST ONLY A")); // successful detail before refresh
  state.getImpl = () => Promise.reject(new ApiError("Forbidden", 403));
  await click(r, r.nodes(x => x.type === "button" && r.textOf(x).trim().endsWith("Làm mới"))[0]);
  // Refreshes both list and selected detail; detail 403 must beat delayed list 200.
  assert.equal(r.byLabel("Xem TEST ONLY A"), undefined);
  delayed.resolve([A, B]); await r.tick();
  assert.equal(r.byLabel("Xem TEST ONLY A"), undefined);
  assert.equal(r.byText("+ Thêm địa điểm").props.disabled, true);
});

test("POST created but response lost: compare new ID/full fields, block repeated POST", async () => {
  const { source, state } = fixture(); let posts = 0;
  state.saveImpl = (_id, next) => { posts++; state.rows = [...state.rows, { ...A, ...next, id: "TEST-C" }];
    return Promise.reject(new ApiError("Network error", 0)); };
  const r = renderer(source); await r.tick(); await click(r, r.byText("+ Thêm địa điểm"));
  form(r).props.onSave(fields); await r.tick();
  assert.equal(posts, 1);
  assert.equal(r.byText("+ Thêm địa điểm").props.disabled, true);
  assert.match(r.textOf(r.tree), /ID mới khớp đủ trường/);
  form(r).props.onSave(fields); await r.tick();
  assert.equal(posts, 1, "POST must not auto-retry or allow repeated submission");
});

test("POST after lost response and GET failure stays blocked; 401 on GET also locks", async () => {
  const { source, state } = fixture(); let lists = 0;
  state.listImpl = () => ++lists === 1 ? [...state.rows] : Promise.reject(new ApiError("GET failed", 500));
  state.saveImpl = () => Promise.reject(new ApiError("Network lost", 0));
  const r = renderer(source); await r.tick(); await click(r, r.byText("+ Thêm địa điểm"));
  form(r).props.onSave(fields); await r.tick();
  assert.equal(r.byText("+ Thêm địa điểm").props.disabled, true);
  assert.match(r.textOf(r.tree), /Chưa thể cập nhật/);
  state.listImpl = () => Promise.reject(new ApiError("Expired", 401));
  await click(r, r.byText("Đọc lại để đối chiếu"));
  assert.equal(r.byLabel("Xem TEST ONLY A"), undefined);
  assert.match(r.textOf(r.tree), /Đăng nhập lại/);
});

test("PATCH 404 removes only missing ID, closes editor and reload failure retains other data", async () => {
  const { source, state } = fixture(); let count = 0;
  state.listImpl = () => ++count === 1 ? [...state.rows] : Promise.reject(new ApiError("Refresh failed", 500));
  state.saveImpl = () => Promise.reject(new ApiError("Gone", 404));
  const r = renderer(source); await r.tick(); await click(r, r.byLabel("Sửa TEST ONLY A"));
  form(r).props.onSave(fields); await r.tick();
  assert.equal(r.byLabel("Xem TEST ONLY A"), undefined);
  assert.ok(r.byLabel("Xem TEST ONLY B"));
  assert.equal(form(r), undefined);
  assert.match(r.textOf(r.tree), /Chưa thể cập nhật/);
});

test("DELETE 404 closes confirmation, keeps other rows and does not claim success", async () => {
  const { source, state } = fixture(); state.removeImpl = () => Promise.reject(new ApiError("Gone", 404));
  state.listImpl = () => [...state.rows]; // even a stale GET must not restore the known missing ID.
  const r = renderer(source); await r.tick(); await click(r, r.byLabel("Xóa TEST ONLY A"));
  deleteDialog(r).props.onConfirm(); await r.tick();
  assert.equal(deleteDialog(r), undefined);
  assert.equal(r.byLabel("Xem TEST ONLY A"), undefined);
  assert.ok(r.byLabel("Xem TEST ONLY B"));
  assert.doesNotMatch(r.textOf(r.tree), /API đã xác nhận xóa mềm thành công/);
});

test("PATCH timeout followed by GET 403 locks all data (including verification failure)", async () => {
  const { source, state } = fixture(); let reads = 0;
  state.saveImpl = () => Promise.reject(new ApiError("Timeout", 504));
  state.getImpl = () => { reads++; return Promise.reject(new ApiError("Access revoked", 403)); };
  const r = renderer(source); await r.tick();
  await click(r, r.byLabel("Sửa TEST ONLY A"));
  form(r).props.onSave(fields); await r.tick();
  assert.equal(reads, 1);
  assert.equal(r.byLabel("Xem TEST ONLY A"), undefined);
  assert.equal(form(r), undefined);
  assert.equal(r.byText("+ Thêm địa điểm").props.disabled, true);
});

test("DELETE response lost: GET 404 and list check remove point but do not claim DELETE success", async () => {
  const { source, state } = fixture();
  state.removeImpl = id => {
    state.rows = state.rows.filter(row => row.id !== id);
    return Promise.reject(new ApiError("Network reset", 0));
  };
  const r = renderer(source); await r.tick(); await click(r, r.byLabel("Xóa TEST ONLY A"));
  deleteDialog(r).props.onConfirm(); await r.tick();
  assert.equal(r.byLabel("Xem TEST ONLY A"), undefined);
  assert.equal(deleteDialog(r), undefined);
  assert.match(r.textOf(r.tree), /GET chi tiết ID TEST-A trả 404/);
  assert.doesNotMatch(r.textOf(r.tree), /API đã xác nhận xóa mềm thành công/);
  assert.equal(state.calls.filter(c => c[0] === "DELETE").length, 1);
});

test("POST HTTP 500 after possible write also locks new POST pending list verification", async () => {
  const { source, state } = fixture(); let count = 0;
  state.saveImpl = () => { count++; return Promise.reject(new ApiError("Internal", 500)); };
  const r = renderer(source); await r.tick(); await click(r, r.byText("+ Thêm địa điểm"));
  form(r).props.onSave(fields); await r.tick();
  assert.equal(count, 1);
  assert.match(r.textOf(r.tree), /Chưa thể khẳng định POST thất bại/);
  assert.equal(r.byText("+ Thêm địa điểm").props.disabled, true);
});

test("POST verification compares full fields and unseen ID, not just matching name", async () => {
  const { source, state } = fixture();
  state.saveImpl = () => {
    state.rows = [...state.rows, { ...A, id: "TEST-OTHER", name: fields.name, address: "DIFFERENT ADDRESS" }];
    return Promise.reject(new ApiError("Network reset", 0));
  };
  const r = renderer(source); await r.tick(); await click(r, r.byText("+ Thêm địa điểm"));
  form(r).props.onSave(fields); await r.tick();
  assert.match(r.textOf(r.tree), /chưa thấy ID mới khớp đầy đủ/);
  assert.doesNotMatch(r.textOf(r.tree), /ID mới khớp đủ trường/);
});

test("GET list 401 after previously loaded data hides list/map and blocks add", async () => {
  const { source, state } = fixture(); let count = 0;
  state.listImpl = () => ++count === 1 ? [...state.rows] : Promise.reject(new ApiError("Session expired", 401));
  const r = renderer(source); await r.tick();
  await click(r, r.nodes(x => x.type === "button" && r.textOf(x).trim().endsWith("Làm mới"))[0]);
  assert.equal(r.byLabel("Xem TEST ONLY A"), undefined);
  assert.equal(r.byText("+ Thêm địa điểm").props.disabled, true);
  assert.match(r.textOf(r.tree), /Đăng nhập lại/);
});

test("GET detail 404 removes missing row, resets selection and refreshes list", async () => {
  const { source, state } = fixture();
  state.getImpl = () => Promise.reject(new ApiError("Not found", 404));
  const r = renderer(source); await r.tick();
  await click(r, r.byLabel("Xem TEST ONLY A"));
  assert.equal(r.byLabel("Xem TEST ONLY A"), undefined);
  assert.ok(r.byLabel("Xem TEST ONLY B"));
  assert.match(r.textOf(r.tree), /Địa điểm không còn được cung cấp/);
});
