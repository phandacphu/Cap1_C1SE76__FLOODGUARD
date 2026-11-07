// Run: node --test tests/floodAreaService.test.cjs (from web/).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadService(fetch) {
  const exports = {};
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/api/floodAreaService.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, require: name => name === './authApi' ? { API_URL: 'https://fixture.invalid/api' } : { ApiError },
    fetch, AbortController, setTimeout, clearTimeout,
  });
  return exports;
}
const area = { id: 'test', name: 'TEST ONLY', areaType: 'flood', source: null, description: null,
  geometry: { type: 'polygon', points: [{ latitude: 16, longitude: 108 }, { latitude: 17, longitude: 108 }, { latitude: 16, longitude: 109 }] } };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('reads real nested envelope, shares in-flight requests and cache; explicit refresh bypasses cache', async () => {
  const calls = [];
  const { floodAreaService: s } = loadService(async url => {
    calls.push(url); return response({ success: true, data: { floodAreas: [area], floodAlerts: [{ id: 'a' }, { id: 'b' }] } });
  });
  const [first, second] = await Promise.all([s.getFloodAreas(), s.getFloodAreas()]);
  assert.equal(first[0].id, 'test'); assert.equal(first, second); assert.equal(calls.length, 1);
  await s.getFloodAreas(); assert.equal(calls.length, 1);
  await s.getFloodAreas(true); assert.equal(calls.length, 2);
  assert.equal(await s.getActiveAlertCount(), 2); await s.getActiveAlertCount();
  assert.equal(calls.length, 3); assert(calls.every(url => /\/flood-areas$|\/flood-alerts\/active$/.test(url)));
});
test('empty array is valid; malformed envelope, success=false and invalid JSON fail explicitly', async () => {
  const { floodAreaService: s } = loadService(async () => response({ success: true, data: { floodAreas: [] } }));
  assert.equal((await s.getFloodAreas()).length, 0);
  for (const body of [[], { success: true, data: [] }, { success: true, data: { floodAreas: {} } }, { success: false, data: { floodAreas: [] } }]) {
    const { floodAreaService: invalid } = loadService(async () => response(body));
    await assert.rejects(invalid.getFloodAreas());
  }
  const { floodAreaService: html } = loadService(async () => new Response('<html>bad gateway</html>'));
  await assert.rejects(html.getFloodAreas());
});
test('propagates HTTP 401/403/500 and network failures; failed refresh can recover', async () => {
  for (const status of [401, 403, 500]) {
    const { floodAreaService: s } = loadService(async () => response({ message: 'test error' }, status));
    await assert.rejects(s.getFloodAreas(), e => e.status === status);
  }
  let fail = false;
  const { floodAreaService: s } = loadService(async () => { if (fail) throw new Error('offline'); return response({ success: true, data: { floodAreas: [area] } }); });
  await s.getFloodAreas(); fail = true; await assert.rejects(s.getFloodAreas(true), e => e.status === 0);
  fail = false; assert.equal((await s.getFloodAreas(true))[0].id, 'test');
});
test('rejects entire invalid geometry without deleting bad vertices or inventing a polygon', () => {
  const { isValidFloodArea } = loadService(() => {});
  assert.equal(isValidFloodArea(area), true);
  for (const point of [{ latitude: Infinity, longitude: 108 }, { latitude: NaN, longitude: 108 }, { latitude: 91, longitude: 108 }, { latitude: 16, longitude: -181 }, { latitude: '16', longitude: 108 }]) {
    assert.equal(isValidFloodArea({ ...area, geometry: { type: 'polygon', points: [point, ...area.geometry.points] } }), false);
  }
  assert.equal(isValidFloodArea({ ...area, geometry: { type: 'polygon', points: [area.geometry.points[0], area.geometry.points[0], area.geometry.points[1]] } }), false);
  for (const bad of [null, {}, { ...area, areaType: 'unknown' }, { ...area, geometry: { type: 'Point', points: area.geometry.points } }]) assert.equal(isValidFloodArea(bad), false);
});

test('accepts live areaType contract including null and omitted legacy classification', () => {
  const { isValidFloodArea } = loadService(() => {});
  for (const areaType of ['flood', 'low_lying', null, undefined]) assert.equal(isValidFloodArea({ ...area, areaType }), true);
});

test('validates the captured live response when LIVE_FLOOD_AREAS is provided', { skip: !process.env.LIVE_FLOOD_AREAS }, async () => {
  const body = JSON.parse(fs.readFileSync(process.env.LIVE_FLOOD_AREAS, 'utf8'));
  const { floodAreaService: service } = loadService(async () => response(body));
  const items = await service.getFloodAreas();
  assert.equal(items.length, body.data.floodAreas.length);
  assert(items.length > 0);
});
