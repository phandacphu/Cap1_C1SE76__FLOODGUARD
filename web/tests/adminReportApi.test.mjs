import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('../src/pages/admin/reports/reportApi.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../src/pages/admin/reports/AdminReportsUiScreen.tsx', import.meta.url), 'utf8');

test('SOS summary uses server from/to while warning summary has no date query', () => {
  assert.match(api, /\/admin\/rescue-requests\/summary\?\$\{query\}/);
  assert.match(api, /\/admin\/flood-alerts\/summary"/);
  assert.match(api, /timeZone: "Asia\/Ho_Chi_Minh"/);
  assert.match(api, /setUTCDate/);
  assert.match(api, /parseApiSummary/);
});

test('V2 schema validates global counts without converting errors to zero', () => {
  assert.match(api, /data\.schemaVersion !== 2/);
  assert.match(api, /data\.active as number\) \+ \(data\.inactive as number\)/);
  assert.match(screen, /value\(warning\.data\?\.total\)/);
  assert.doesNotMatch(screen, /Không có biểu đồ theo ngày/);
});

test('report removes stale data on range change and blocks late responses and access denial', () => {
  assert.match(screen, /setRange\(next\); setSos\(empty\(\)\); setAreas\(empty\(\)\)/);
  assert.match(screen, /current === generation\.current/);
  assert.match(screen, /cause\.status === 401 \|\| cause\.status === 403/);
  assert.match(screen, /setLocked\(true\)/);
});

test('flood area report uses the supported server-side date filters and validates category totals', () => {
  assert.match(api, /\/admin\/flood-areas\/summary\?\$\{query\}/);
  assert.match(api, /parseFloodAreaSummary/);
  assert.match(api, /by\.flood \+ by\.low_lying \+ by\.unclassified/);
  assert.match(screen, /fetchFloodAreaReport\(token, range\)/);
});

test('safe location counts derive only from authenticated Admin catalogue and known type labels', () => {
  assert.match(api, /fetchAdminSafeLocations\(token\)/);
  assert.match(api, /location\.type \?\? "unclassified"/);
  assert.match(screen, /fetchSafeLocationReport\(token\)/);
  assert.doesNotMatch(screen, /capacity|availableBeds|onlineTeams/);
});
