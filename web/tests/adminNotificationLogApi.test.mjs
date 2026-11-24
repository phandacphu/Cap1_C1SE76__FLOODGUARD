import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('../src/pages/admin/notifications/notificationLogApi.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../src/pages/admin/notifications/AdminNotificationsUiScreen.tsx', import.meta.url), 'utf8');

test('lookup requests send JWT GET with exactly one query key, limit and optional cursor', () => {
  assert.match(api, /new URLSearchParams\(\{ \[key\]: value, limit: "20" \}\)/);
  assert.match(api, /params\.set\("cursor", cursor\)/);
  assert.match(api, /Authorization: `Bearer \$\{token\}`/);
  assert.match(api, /\/admin\/notification-logs\?/);
  assert.doesNotMatch(api, /method: "POST"|method: "PATCH"|method: "DELETE"/);
});

test('validates response schema, duplicate ids and permission failures', () => {
  assert.match(api, /parseLogPage/);
  assert.match(api, /seen\.has\(entry\.id\)/);
  assert.match(api, /value\.nextCursor === null/);
  assert.match(api, /response\.status === 401/);
  assert.match(api, /response\.status === 403/);
  assert.match(screen, /setLocked\(true\)/);
  assert.match(screen, /setRecords\(\[\]\)/);
});

test('screen retains old data on non-permission refresh failure, exposes paging and GMT+7', () => {
  assert.match(screen, /setStale\(loaded && !permission\)/);
  assert.match(screen, /search\(true\)/);
  assert.match(screen, /Asia\/Ho_Chi_Minh/);
  assert.match(screen, /Kết quả chưa xác định/);
});
