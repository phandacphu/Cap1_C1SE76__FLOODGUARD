import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function transpile(file) {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const exports = {};
const context = { exports, crypto: globalThis.crypto, Date, Map, setTimeout, require: (id) => {
  if (id.includes('floodWarningApi')) return { WarningRequestError: class extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } } };
  if (id.includes('floodWarningTypes')) return { warningOrder: (a, b) => Date.parse(b.startAt) - Date.parse(a.startAt) || a.id.localeCompare(b.id) };
  throw new Error(`Unexpected dependency ${id}`);
} };
vm.runInNewContext(transpile('../src/pages/admin/flood-warning/floodWarningDemo.ts'), context);
test('fixture supports multiple active and inactive history with independent summary', async () => {
  const source = exports.createFloodWarningDemo();
  assert.equal((await source.list('active')).length, 2);
  assert.equal((await source.list('inactive')).length, 1);
  assert.equal((await source.summary()).total, 3);
  assert.equal((await source.list('active'))[0].endAt, null);
});
test('create retries with the same key exactly once, edits revision, deactivation is idempotent', async () => {
  const source = exports.createFloodWarningDemo();
  const body = { title: 'TEST ONLY - Test', content: 'Test content' };
  const key = 'b41dc17d-aaaa-4ddd-8aaa-cccccccccccc';
  const first = await source.create(body, key);
  assert.equal((await source.create(body, key)).id, first.id);
  assert.equal((await source.creationRequest(key)).id, first.id);
  assert.equal((await source.summary()).total, 4);
  await assert.rejects(source.create({ ...body, title: 'Different' }, key), { code: 'IDEMPOTENCY_CONFLICT' });
  const edited = await source.update(first.id, first.revision, { title: 'TEST ONLY - Edited' });
  await assert.rejects(source.update(first.id, first.revision, { title: 'Stale' }), { code: 'ALERT_REVISION_CONFLICT' });
  const off = await source.deactivate(first.id);
  assert.equal(off.endAt, (await source.deactivate(first.id)).endAt);
  assert.equal(off.revision, (await source.deactivate(first.id)).revision);
  await assert.rejects(source.update(first.id, edited.revision, { title: 'No' }), { code: 'ALERT_ALREADY_INACTIVE' });
  assert.equal((await source.list('inactive')).length, 2);
});
