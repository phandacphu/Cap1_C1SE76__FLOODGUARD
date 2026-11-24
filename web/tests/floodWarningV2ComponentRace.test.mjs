import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

// Minimal hook/JSX component harness: invokes the actual screen's handlers and
// rerenders after each async boundary, without a browser or real HTTP requests.
function mount(source) {
  const slots = [];
  let cursor = 0;
  let tree;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback) { cursor++; return callback; },
    useEffect() { cursor++; },
  };
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  class WarningRequestError extends ApiError {}
  class WarningFlowGuard {
    epoch = 0; listVersion = 0; detailVersion = 0; locked = false;
    beginList() { return { epoch: this.epoch, version: ++this.listVersion }; }
    beginDetail() { return { epoch: this.epoch, version: ++this.detailVersion }; }
    snapshot() { return this.epoch; }
    validEpoch(e) { return !this.locked && this.epoch === e; }
    validList(t) { return this.validEpoch(t.epoch) && t.version === this.listVersion; }
    validDetail(t) { return this.validEpoch(t.epoch) && t.version === this.detailVersion; }
    invalidateDetail() { this.detailVersion++; }
    invalidateList() { this.listVersion++; }
    invalidateAll() { this.epoch++; this.listVersion++; this.detailVersion++; }
    lock() { this.locked = true; this.invalidateAll(); }
    get isLocked() { return this.locked; }
  }
  const path = new URL('../src/pages/admin/flood-warning/FloodWarningManagementScreen.tsx', import.meta.url);
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const modules = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs },
    'react-router-dom': { useNavigate: () => () => {} },
    '../../../api/http': { ApiError },
    '../../../context/AuthContext': { useAuth: () => ({ logout() {} }) },
    './floodWarningApi': { WarningRequestError },
    './floodWarningTypes': { warningOrder: () => 0, warningTime: String },
    './warningFlowGuard': { WarningFlowGuard, patchNeedsReconciliation: (s) => s === 0 || s === 429 || s >= 500 },
  };
  vm.runInNewContext(js, { exports, require: (name) => modules[name] ?? {}, localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null }, crypto: { randomUUID: () => 'test-key' } });
  const render = () => { cursor = 0; tree = exports.default({ source }); return tree; };
  function elements(node, found = []) {
    if (Array.isArray(node)) { node.forEach((child) => elements(child, found)); return found; }
    if (node && typeof node === 'object' && node.props) { found.push(node); elements(node.props.children, found); }
    return found;
  }
  const label = (node) => typeof node === 'string' ? node : Array.isArray(node) ? node.map(label).join('') : node?.props ? label(node.props.children) : '';
  const button = (name) => {
    const buttons = elements(tree).filter((node) => node.type === 'button');
    const match = buttons.find((node) => label(node).includes(name));
    assert.ok(match, `button ${name} exists`);
    return match.props;
  };
  return {
    render, button, ApiError,
    detailText: () => label(elements(tree).find((node) => node.type === 'section' && node.props['aria-label'] === 'Chi tiết cảnh báo')),
    editForm: () => elements(tree).find((node) => typeof node.props.onSave === 'function' && 'warning' in node.props)?.props,
    labels: () => elements(tree).map(label).join(' '),
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); };
const warning = (id) => ({ id, title: `Warning ${id}`, content: 'Body', status: 'active', revision: 1, schemaVersion: 2, startAt: '2026-11-24T00:00:00Z', endAt: null, createdAt: '2026-11-24T00:00:00Z', updatedAt: '2026-11-24T00:00:00Z' });

test('component locks edit/deactivate while refreshing and after failed reconciliation', async () => {
  let listFailure = false;
  const slowList = deferred();
  const source = { demo: true, async list() { if (listFailure) return slowList.promise; return [warning('A')]; }, async summary() { return { total: 1, active: 1, inactive: 0 }; }, async detail() { return warning('A'); } };
  const view = mount(source); view.render();
  view.button('Làm mới').onClick(); await tick(); view.render();
  view.button('Xem chi tiết').onClick(); await tick(); view.render();
  assert.equal(view.button('Chỉnh sửa').disabled, false);
  listFailure = true;
  view.button('Làm mới').onClick(); view.render();
  assert.equal(view.button('Chỉnh sửa').disabled, true);
  assert.equal(view.button('Tắt cảnh báo').disabled, true);
  slowList.reject(new Error('500')); await tick(); view.render();
  assert.equal(view.labels().includes('Chưa xác minh được trạng thái/revision mới'), true);
  assert.equal(view.labels().includes('Chỉnh sửa'), false);
});

test('late deactivate A never replaces currently selected B even when list refresh fails', async () => {
  const pending = deferred();
  let failList = false;
  const source = {
    demo: true,
    async list() { if (failList) throw new Error('500'); return [warning('A'), warning('B')]; },
    async summary() { return { total: 2, active: 2, inactive: 0 }; },
    async detail(id) { return warning(id); },
    async deactivate() { return pending.promise; },
  };
  const view = mount(source); view.render();
  view.button('Làm mới').onClick(); await tick(); view.render();
  // Both rows have the same action label; choose A first.
  view.button('Xem chi tiết').onClick(); await tick(); view.render();
  view.button('Tắt cảnh báo').onClick(); view.render();
  view.button('Xác nhận tắt').onClick(); view.render();
  view.button('Đóng').onClick(); view.render();
  // Select B directly by invoking the second row's detail button.
  const tableButtons = (() => {
    const collect = (node, acc = []) => {
      if (Array.isArray(node)) { node.forEach((n) => collect(n, acc)); return acc; }
      if (node?.props) { if (node.type === 'button' && node.props.children === 'Xem chi tiết') acc.push(node.props); collect(node.props.children, acc); }
      return acc;
    };
    return collect(view.render());
  })();
  tableButtons[1].onClick(); await tick(); view.render();
  failList = true;
  pending.resolve({ ...warning('A'), status: 'inactive', endAt: '2026-11-24T01:00:00Z' });
  await tick(); view.render();
  assert.equal(view.detailText().includes('Warning B'), true);
  assert.equal(view.detailText().includes('Warning A'), false);
  assert.equal(view.button('Chỉnh sửa').disabled, false);
});

test('filter change during pending PATCH preserves uncertain draft if reconciliation fails', async () => {
  const pendingPatch = deferred();
  let detailReadFails = false;
  const source = {
    demo: true,
    async list() { return [warning('A')]; },
    async summary() { return { total: 1, active: 1, inactive: 0 }; },
    async detail() { if (detailReadFails) throw new Error('read failed'); return warning('A'); },
    async update() { return pendingPatch.promise; },
  };
  const view = mount(source); view.render();
  view.button('Làm mới').onClick(); await tick(); view.render();
  view.button('Xem chi tiết').onClick(); await tick(); view.render();
  view.button('Chỉnh sửa').onClick(); view.render();
  const form = view.editForm();
  assert.ok(form);
  form.onSave({ title: 'Draft to retain', content: 'Uncertain body' });
  view.render();
  view.button('Đã tắt').onClick(); view.render();
  view.button('Làm mới').onClick(); await tick(); view.render();
  detailReadFails = true;
  pendingPatch.reject(new view.ApiError('500', 500));
  await tick(); view.render();
  assert.equal(view.labels().includes('Draft to retain'), true);
  assert.equal(view.labels().includes('Đối chiếu sửa'), true);
  assert.equal(view.editForm(), undefined);
});
