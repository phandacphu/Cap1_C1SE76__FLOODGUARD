const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function fixture() {
  const calls = [];
  let now = 1000;
  let fail = false;
  const payloads = {};
  const exports = {};
  class Clock extends Date { static now() { return now; } }
  const loaders = Object.fromEntries(['Points','Areas','Buffers','Radar'].map(key => [`fetchHistorical${key}`, async () => {
    calls.push(key.toLowerCase());
    if (fail) throw new Error('TEST offline');
    return payloads[key.toLowerCase()] ?? { type: 'FeatureCollection', features: [] };
  }]));
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/pages/map/historicalLayerCache.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => name.includes('historicalDetails') ? { validateHistoricalMetadata: data => data } : loaders, Date: Clock });
  return { api: exports, calls, payload: (key, data) => { payloads[key] = data; }, time: value => { now = value; }, fail: value => { fail = value; } };
}
test('opening visual map with buffers/radar off never fetches them; force refresh still skips disabled layers', async () => {
  const f = fixture();
  await f.api.getEnabledHistoricalLayers(['points','areas']);
  assert.deepEqual(f.calls, ['points','areas']);
  await f.api.getEnabledHistoricalLayers(['points','areas'], true);
  assert.deepEqual(f.calls, ['points','areas','points','areas']);
  await f.api.getEnabledHistoricalLayers([] ,true);
  assert.equal(f.calls.length, 4);
});
test('enable fetches once; cached toggle keeps API timestamp; hidden layer never refreshes', async () => {
  const f = fixture();
  const first = await f.api.getEnabledHistoricalLayers(['radar']);
  f.time(2000);
  await f.api.getEnabledHistoricalLayers([]);
  const second = await f.api.getEnabledHistoricalLayers(['radar']);
  assert.equal(f.calls.length, 1);
  assert.equal(second[0].snapshot.fetchedAt, first[0].snapshot.fetchedAt);
  assert.equal(second[0].snapshot, first[0].snapshot);
  f.time(62000);
  await f.api.getEnabledHistoricalLayers(['points']);
  assert.deepEqual(f.calls, ['radar','points']);
  await f.api.getEnabledHistoricalLayers(['radar']);
  assert.deepEqual(f.calls, ['radar','points','radar']);
});
test('concurrent loads deduplicate and failed load never overwrites successful snapshot', async () => {
  const f = fixture();
  const [a,b] = await Promise.all([f.api.getHistoricalLayer('buffers'), f.api.getHistoricalLayer('buffers')]);
  assert.equal(a,b);
  assert.equal(f.calls.length,1);
  f.time(2000); f.fail(true);
  const failed = await f.api.getEnabledHistoricalLayers(['buffers'], true);
  assert.equal(failed[0].snapshot, null);
  assert.ok(failed[0].error);
  assert.equal((await f.api.getHistoricalLayer('buffers')).fetchedAt, 1000);
});


test('forced refresh replaces edited HIST metadata and successful empty deletion is preserved after errors', async () => {
  const f = fixture();
  const layer = description => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id:'HIST-TEST', description }, geometry: { type:'Point', coordinates:[108,16] } }] });
  f.payload('points',layer('Before'));
  const before = await f.api.getHistoricalLayer('points');
  f.time(2000); f.payload('points',layer('After'));
  const after = await f.api.getHistoricalLayer('points',true);
  assert.equal(before.data.features[0].properties.description,'Before');
  assert.equal(after.data.features[0].properties.description,'After');
  assert.equal(after.fetchedAt,2000);
  f.payload('points',{type:'FeatureCollection',features:[]});
  const deleted = await f.api.getHistoricalLayer('points',true);
  assert.equal(deleted.data.features.length,0);
  f.fail(true); f.time(3000);
  const failed = await f.api.getEnabledHistoricalLayers(['points'],true);
  assert.ok(failed[0].error);
  assert.equal((await f.api.getHistoricalLayer('points')).data.features.length,0);
  assert.equal((await f.api.getHistoricalLayer('points')).fetchedAt,2000);
});
