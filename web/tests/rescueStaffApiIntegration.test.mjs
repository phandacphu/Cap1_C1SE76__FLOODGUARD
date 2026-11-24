import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path = new URL('../src/pages/admin/user-management/userApi.ts', import.meta.url);
const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function api(response) {
  const calls = [];
  const exports = {};
  const fetch = async (url, options) => {
    calls.push({ url, ...options });
    return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body };
  };
  const window = { setTimeout, clearTimeout };
  vm.runInNewContext(code, { exports, require: () => ({ API_URL: 'http://test.local/api' }), window, fetch, AbortController });
  return { ...exports, calls };
}

const account = { id: 'rescue-1', role: 'rescue', isActive: true, fullName: 'Rescue Test', email: 'rescue@example.test', phone: null };

test('Rescue detail uses existing Admin Users GET with JWT and matching ID', async () => {
  const client = api({ status: 200, body: { data: { user: account } } });
  const user = await client.fetchUserDetail('token', 'rescue-1');
  assert.equal(user.id, 'rescue-1');
  assert.equal(user.role, 'rescue');
  assert.equal(client.calls[0].url, 'http://test.local/api/admin/users/rescue-1');
  assert.equal(client.calls[0].headers.Authorization, 'Bearer token');
});

test('Rescue detail rejects another ID and malformed success instead of displaying a different account', async () => {
  for (const user of [{ ...account, id: 'other' }, undefined]) {
    const client = api({ status: 200, body: { data: { user } } });
    await assert.rejects(client.fetchUserDetail('token', 'rescue-1'), (error) => error.status === -1);
  }
});

test('Rescue account activation uses existing PATCH isActive only; not shift/online state', async () => {
  const client = api({ status: 200, body: { data: { user: { ...account, isActive: false } } } });
  const updated = await client.patchUser('token', 'rescue-1', { isActive: false });
  assert.equal(updated.isActive, false);
  assert.equal(client.calls[0].method, 'PATCH');
  assert.equal(client.calls[0].body, JSON.stringify({ isActive: false }));
});

test('Rescue UI reads account records rather than fixture teams, shifts or duty flags', () => {
  const screen = readFileSync(new URL('../src/pages/admin/rescue-staff/RescueStaffUiScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /useUserManagement\(\)/);
  assert.match(screen, /u\.role === "rescue"/);
  assert.match(screen, /fetchUserDetail\(token, id\)/);
  assert.match(screen, /patchUser\(token, id, \{ isActive:/);
  assert.doesNotMatch(screen, /previewStaff|team:|shift:/);
});
