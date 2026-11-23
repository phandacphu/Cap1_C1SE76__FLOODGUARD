import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const path = new URL('../src/pages/admin/flood-warning/floodWarningApi.ts', import.meta.url);
const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const requests = [];
let response = async () => ({ status: 200, ok: true, json: async () => ({ success: true, data: {} }) });
const context = { exports: {}, require: (id) => id.includes('authApi') ? { API_URL: 'http://test/api' } : id.includes('/http') ? { ApiError } : require(id),
  localStorage: { getItem: () => 'TEST-ADMIN-TOKEN' }, URLSearchParams, AbortController, setTimeout, clearTimeout,
  fetch: async (url, options) => { requests.push({ url, ...options }); return response(url, options); } };
vm.runInNewContext(code, context);
const { floodWarningApi: api, parseWarning, WarningRequestError } = context.exports;
const active = { id: 'TEST-V2-1', schemaVersion: 2, title: 'TEST ONLY', content: 'Test content', status: 'active', scope: 'all_published_zones', revision: 1,
  startAt: '2026-11-22T01:00:00.000Z', endAt: null, createdAt: '2026-11-22T01:00:00.000Z', updatedAt: '2026-11-22T01:00:00.000Z' };
function reply(data, status = 200) { response = async () => ({ status, ok: status < 400, json: async () => ({ success: status < 400, data }) }); }
test('accepts V2 active with endAt null; rejects V1 and invalid shape', () => {
  assert.equal(parseWarning(active).endAt, null);
  assert.throws(() => parseWarning({ ...active, schemaVersion: 1 }), { status: 502 });
  assert.throws(() => parseWarning({ ...active, endAt: '2026-11-25T01:00:00Z' }), { status: 502 });
  assert.throws(() => parseWarning({ ...active, severity: 'high', schemaVersion: undefined }), { status: 502 });
});
test('list query uses only status/q and validates schemaVersion, summary is global', async () => {
  reply({ schemaVersion: 2, floodAlerts: [active] });
  assert.equal((await api.list('active', 'TEST ONLY')).length, 1);
  assert.match(requests.at(-1).url, /status=active&q=TEST\+ONLY/);
  reply({ schemaVersion: 2, total: 3, active: 2, inactive: 1 });
  assert.equal((await api.summary()).active, 2);
  assert.equal(requests.at(-1).url, 'http://test/api/admin/flood-alerts/summary');
  reply({ floodAlerts: [] });
  await assert.rejects(api.list(), { status: 502 });
});
test('create sends exactly title/content and same idempotency key on replay', async () => {
  reply({ floodAlert: active });
  const fields = { title: 'TEST ONLY', content: 'Test content' };
  const key = '8feec7ad-0123-4123-a123-123456789abc';
  await api.create(fields, key); await api.create(fields, key);
  const [first, second] = requests.slice(-2);
  assert.equal(first.headers['Idempotency-Key'], key);
  assert.equal(second.headers['Idempotency-Key'], key);
  assert.deepEqual(JSON.parse(first.body), fields);
  assert.deepEqual(JSON.parse(second.body), fields);
});
test('update sends revision, deactivate uses POST {}, reconcile uses GET', async () => {
  reply({ floodAlert: active });
  await api.update(active.id, 1, { title: 'Edited' });
  assert.deepEqual(JSON.parse(requests.at(-1).body), { expectedRevision: 1, title: 'Edited' });
  await api.deactivate(active.id);
  assert.equal(requests.at(-1).method, 'POST');
  assert.deepEqual(JSON.parse(requests.at(-1).body), {});
  await api.creationRequest('8feec7ad-0123-4123-a123-123456789abc');
  assert.match(requests.at(-1).url, /creation-requests\//);
});
test('409 retains API code and network uncertainty is distinguished', async () => {
  response = async () => ({ status: 409, ok: false, json: async () => ({ message: 'Conflict', code: 'ALERT_REVISION_CONFLICT' }) });
  await assert.rejects(api.update(active.id, 1, { title: 'New' }), (e) => e instanceof WarningRequestError && e.code === 'ALERT_REVISION_CONFLICT');
  response = async () => { throw new TypeError('offline'); };
  await assert.rejects(api.create({ title: 'A', content: 'B' }, '8feec7ad-0123-4123-a123-123456789abc'), (e) => e.uncertain === true);
});
