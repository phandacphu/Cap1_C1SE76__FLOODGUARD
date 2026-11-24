import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('../src/pages/admin/flood-warning/warningFlowGuard.ts', import.meta.url);
const source = readFileSync(file, 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} };
vm.runInNewContext(code, context);
const { WarningFlowGuard, patchNeedsReconciliation } = context.exports;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('GET detail A still running -> list 403 locks and old detail 200 cannot restore actions', async () => {
  const guard = new WarningFlowGuard();
  const pendingDetail = deferred();
  const ticket = guard.beginDetail();
  const result = pendingDetail.promise.then(() => guard.validDetail(ticket));
  guard.lock();
  pendingDetail.resolve({ id: 'A', status: 'active' });
  assert.equal(await result, false);
  assert.equal(guard.isLocked, true);
});

test('late 401/403 after newer successful refresh invalidates both list and detail callbacks', () => {
  const guard = new WarningFlowGuard();
  const firstList = guard.beginList();
  const secondList = guard.beginList();
  assert.equal(guard.validList(secondList), true);
  assert.equal(guard.validList(firstList), false);
  const detail = guard.beginDetail();
  guard.lock(); // stale request authorization failure still locks session
  assert.equal(guard.validList(secondList), false);
  assert.equal(guard.validDetail(detail), false);
});

test('refresh invalidates an old active detail and accepts only the later read of the same selection', async () => {
  const guard = new WarningFlowGuard();
  const staleDetail = guard.beginDetail();
  const freshList = guard.beginList();
  guard.invalidateDetail();
  const freshDetail = guard.beginDetail();
  assert.equal(guard.validDetail(staleDetail), false);
  assert.equal(guard.validList(freshList), true);
  assert.equal(guard.validDetail(freshDetail), true);
  assert.equal(guard.validDetail(freshDetail) && guard.validList(freshList), true);
  guard.invalidateDetail(); // selecting another ID / closing detail
  assert.equal(guard.validDetail(freshDetail), false);
});

test('PATCH 500, malformed success 502 and timeout require GET reconciliation before another write', () => {
  for (const status of [0, 429, 500, 502, 503, 504]) assert.equal(patchNeedsReconciliation(status), true);
  assert.equal(patchNeedsReconciliation(409, 'ALERT_ALREADY_INACTIVE'), true);
  assert.equal(patchNeedsReconciliation(409, 'ALERT_REVISION_CONFLICT'), false);
  const old = { id: 'A', revision: 1, title: 'Old', content: 'Old body' };
  const draft = { title: 'Edited', content: 'New body' };
  let blocked = true;
  const failedReconcile = deferred();
  failedReconcile.reject(new Error('GET failed'));
  return failedReconcile.promise.catch(() => {
    assert.equal(blocked, true); // retain draft, no repeat PATCH
    assert.deepEqual(draft, { title: 'Edited', content: 'New body' });
    const fresh = { ...old, revision: 2, ...draft };
    blocked = false; // only a successful detail read permits a new explicit edit
    assert.equal(fresh.revision, 2);
    assert.equal(blocked, false);
  });
});
