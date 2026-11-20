const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '../src/pages/rescue');
function load(file, stubs = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  vm.runInNewContext(code, { exports, Date, require: name => {
    if (stubs[name]) return stubs[name];
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === '../sosDirect') return load('sosDirect.ts');
    if (name === './historyData') return load('history/historyData.ts');
    if (name === '../sosMapData') return load('sosMapData.ts');
    throw new Error('Unexpected import ' + name);
  }});
  return exports;
}
const { filterHistory } = load('history/historyData.ts');
const filters = { search: '', from: '', to: '', sort: 'newest', mine: false, userId: 'RESCUE-A' };
const sos = (id, fields = {}) => ({ id, state: 'rescued', completedBy: 'RESCUE-A', completedAt: '2026-11-18T02:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z', situations: ['trapped'], numberOfPeople: 0,
  residentId: null, note: null, location: null, ...fields });
const ids = values => Array.from(values, item => item.id);

test('history excludes active/legacy records without guessing from raw status', () => {
  assert.deepEqual(ids(filterHistory([sos('ok'), sos('active', { state: 'active' }), sos('legacy', { state: 'legacy_other', status: 'cancelled' })], filters)), ['ok']);
});
test('completion filter uses Vietnam midnight inclusively, not creation date', () => {
  const rows = [sos('start', { completedAt: '2026-11-17T17:00:00.000Z' }), sos('end', { completedAt: '2026-11-18T16:59:59.999Z' }),
    sos('before', { completedAt: '2026-11-17T16:59:59.999Z' }), sos('after', { completedAt: '2026-11-18T17:00:00.000Z' }), sos('missing', { completedAt: null })];
  assert.deepEqual(ids(filterHistory(rows, { ...filters, from: '2026-11-18', to: '2026-11-18' })), ['end', 'start']);
});
test('mine compares server actor ID; missing actor never becomes current user', () => {
  const rows = [sos('mine'), sos('other', { completedBy: 'RESCUE-B' }), sos('unknown', { completedBy: null })];
  assert.deepEqual(ids(filterHistory(rows, { ...filters, mine: true })), ['mine']);
  assert.equal(filterHistory(rows, { ...filters, mine: true, userId: null }).length, 0);
});
test('sort by completion time, keep missing metadata last and input unchanged', () => {
  const rows = [sos('unknown', { completedAt: null }), sos('later', { completedAt: '2026-11-19T01:00:00Z' }), sos('earlier')];
  assert.deepEqual(ids(filterHistory(rows, filters)), ['later', 'earlier', 'unknown']);
  assert.deepEqual(ids(filterHistory(rows, { ...filters, sort: 'oldest' })), ['earlier', 'later', 'unknown']);
  assert.deepEqual(ids(rows), ['unknown', 'later', 'earlier']);
});
test('search matches display code, actor and situations; invalid date range returns no matches', () => {
  const rows = [sos('WrgE2jyemlMmgbA9Hjpi'), sos('other', { completedBy: 'RESCUE-B', situations: null })];
  assert.deepEqual(ids(filterHistory(rows, { ...filters, search: ' SOS-WRGE2JYE ' })), ['WrgE2jyemlMmgbA9Hjpi']);
  assert.deepEqual(ids(filterHistory(rows, { ...filters, search: 'rescue-b' })), ['other']);
  assert.deepEqual(ids(filterHistory(rows, { ...filters, search: 'Bị mắc kẹt' })), ['WrgE2jyemlMmgbA9Hjpi']);
  assert.equal(filterHistory(rows, { ...filters, from: '2026-11-19', to: '2026-11-18' }).length, 0);
});

function render(requests, extra = {}) {
  let query;
  const { RescueHistory } = load('history/RescueHistory.tsx', {
    'react-router-dom': { Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) },
    '../../../context/AuthContext': { useAuth: () => ({ user: { id: 'RESCUE-A' } }) },
    '../../../components/layout/RescueLayout': { RescueLayout: ({ children }) => children },
    '../components/DirectSosFeedback': { DirectSosFeedback: ({ error }) => error ? React.createElement('p', { role: 'alert' }, error) : null },
    '../components/SosOperationsMap': { SosOperationsMap: () => { throw new Error('Map must stay unmounted until requested'); } },
    '../useRescue': { useRescueRequests: value => { query = value; return { requests, loading: false, error: null, status: null, updatedAt: null, refresh() {}, ...extra }; } },
  });
  return { html: renderToStaticMarkup(React.createElement(RescueHistory)), query };
}
test('history uses existing rescued endpoint only, defaults table, preserves missing GPS and zero, escapes API text', () => {
  const { html, query } = render([sos('TEST-<script>', { completedBy: '<img src=x onerror=alert(1)>' })]);
  assert.equal(query.state, 'rescued');
  assert.equal(query.sort, 'newest');
  assert.equal(query.from, undefined);
  assert.match(html, /Số người trong yêu cầu: 0/);
  assert.match(html, /Chưa có tọa độ hợp lệ/);
  assert.match(html, /TEST-%3Cscript%3E\?from=history/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
});
test('initial load error is not empty history; stale data remain alongside failure', () => {
  const initial = render(null, { error: 'Mất mạng' }).html;
  assert.match(initial, /Mất mạng/);
  assert.doesNotMatch(initial, /Chưa có SOS đã cứu/);
  const stale = render([sos('TEST-RETAIN')], { error: 'Chưa thể cập nhật' }).html;
  assert.match(stale, /TEST-RETAIN/);
  assert.match(stale, /Chưa thể cập nhật/);
  assert.match(render([]).html, /Chưa có SOS đã cứu/);
});
