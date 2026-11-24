import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

// Minimal hook/JSX component harness: invokes the actual screen's handlers and
// rerenders after each async boundary, without a browser or real HTTP requests.
function mount(source, { effects = false } = {}) {
  const slots = [];
  let cursor = 0;
  let tree;
  let pendingEffects = [];
  const equalDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
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
    useCallback(callback, deps) {
      const index = cursor++;
      if (!(index in slots) || !equalDeps(slots[index].deps, deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!effects) return;
      if (!(index in slots) || !equalDeps(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, cleanup: null };
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index].cleanup = callback() ?? null;
        });
      }
    },
  };
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  class WarningRequestError extends ApiError {}
  const guardPath = new URL('../src/pages/admin/flood-warning/warningFlowGuard.ts', import.meta.url);
  const guardCode = ts.transpileModule(readFileSync(guardPath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const guardExports = {};
  vm.runInNewContext(guardCode, { exports: guardExports });
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
    './warningFlowGuard': guardExports,
  };
  vm.runInNewContext(js, { exports, require: (name) => modules[name] ?? {}, localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null }, crypto: { randomUUID: () => 'test-key' } });
  const render = () => {
    cursor = 0; pendingEffects = [];
    tree = exports.default({ source });
    pendingEffects.forEach((run) => run());
    return tree;
  };
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
    buttons: (name) => elements(tree).filter((node) => node.type === 'button' && label(node).includes(name)).map((node) => node.props),
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

test('deactivate A refresh finishes before pending GET B: B resolves and loading clears', async () => {
  const pendingDeactivate = deferred();
  const pendingB = deferred();
  const source = {
    demo: true,
    async list() { return [warning('A'), warning('B')]; },
    async summary() { return { total: 2, active: 2, inactive: 0 }; },
    async detail(id) { return id === 'B' ? pendingB.promise : warning('A'); },
    async deactivate() { return pendingDeactivate.promise; },
  };
  const view = mount(source); view.render();
  view.button('Làm mới').onClick(); await tick(); view.render();
  view.buttons('Xem chi tiết')[0].onClick(); await tick(); view.render();
  view.button('Tắt cảnh báo').onClick(); view.render();
  view.button('Xác nhận tắt').onClick(); view.render();
  view.button('Đóng').onClick(); view.render();
  view.buttons('Xem chi tiết')[1].onClick(); view.render();
  assert.equal(view.labels().includes('Đang tải chi tiết'), true);
  pendingDeactivate.resolve({ ...warning('A'), status: 'inactive', endAt: '2026-11-24T01:00:00Z' });
  await tick(); view.render();
  assert.equal(view.labels().includes('Đang tải chi tiết'), true);
  pendingB.resolve(warning('B')); await tick(); view.render();
  assert.equal(view.detailText().includes('Warning B'), true);
  assert.equal(view.labels().includes('Đang tải chi tiết'), false);
  assert.equal(view.buttons('Xem chi tiết').every((button) => !button.disabled), true);
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
  const view = mount(source, { effects: true }); view.render();
  await tick(); view.render();
  view.button('Xem chi tiết').onClick(); await tick(); view.render();
  view.button('Chỉnh sửa').onClick(); view.render();
  const form = view.editForm();
  assert.ok(form);
  form.onSave({ title: 'Draft to retain', content: 'Uncertain body' });
  view.render();
  view.button('Đã tắt').onClick(); view.render(); // executes effect cleanup and new refresh
  await tick(); view.render();
  detailReadFails = true;
  pendingPatch.reject(new view.ApiError('500', 500));
  await tick(); view.render();
  assert.equal(view.labels().includes('Draft to retain'), true);
  assert.equal(view.labels().includes('Đối chiếu sửa'), true);
  assert.equal(view.editForm(), undefined);
});
