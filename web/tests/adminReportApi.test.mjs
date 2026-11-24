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
  assert.match(screen, /value=\{warning\.data\.total\}/);
  assert.doesNotMatch(screen, /Không có biểu đồ theo ngày/);
});

test('managed area summary uses existing global Admin API and validates all backend categories', () => {
  assert.match(api, /"\/admin\/flood-areas\/summary", token/);
  assert.match(api, /parseManagedAreaSummary/);
  assert.match(api, /counts\.flood \+ counts\.low_lying \+ counts\.unclassified/);
  assert.doesNotMatch(api, /\/admin\/flood-areas\/summary\?/);
  assert.match(screen, /fetchManagedAreaReport\(token\)/);
  assert.match(screen, /Promise\.all\(\[fetchFloodAreaReport\(\), fetchManagedAreaReport\(token\)\]\)/);
  assert.match(screen, /combineAreaReports\(history, managed\)/);
});

test('combined area counts exclude unclassified Admin data without hardcoding the initial 184', () => {
  assert.match(api, /const flood = history\.historicalFlood \+ managed\.flood/);
  assert.match(api, /const lowLying = history\.radarCandidates \+ managed\.lowLying/);
  assert.match(api, /total: flood \+ lowLying/);
  assert.doesNotMatch(api, /total:\s*187|total:\s*184|historicalFlood:\s*27|radarCandidates:\s*157/);
  assert.match(screen, /setAreas\(\{ data: null, loading: false/);
});

test('report removes stale data on range change and blocks late responses and access denial', () => {
  assert.match(screen, /setRange\(next\); setSos\(empty\(\)\)/);
  assert.match(screen, /current === generation\.current/);
  assert.match(screen, /cause\.status === 401 \|\| cause\.status === 403/);
  assert.match(screen, /setLocked\(true\)/);
});

test('flood area report counts real history and radar layers, independent of SOS date range', () => {
  assert.match(api, /Promise\.all\(\[fetchHistoricalAreas\(\), fetchHistoricalRadar\(\)\]\)/);
  assert.match(api, /history\.features\.length/);
  assert.match(api, /radar\.features\.length/);
  assert.match(screen, /fetchFloodAreaReport\(\)/);
  assert.doesNotMatch(screen, /setAreas\(empty\(\)\)/);
});

test('safe location counts derive only from authenticated Admin catalogue and known type labels', () => {
  assert.match(api, /fetchAdminSafeLocations\(token\)/);
  assert.match(api, /location\.type \?\? "unclassified"/);
  assert.match(screen, /fetchSafeLocationReport\(token\)/);
  assert.doesNotMatch(screen, /capacity|availableBeds|onlineTeams/);
});
