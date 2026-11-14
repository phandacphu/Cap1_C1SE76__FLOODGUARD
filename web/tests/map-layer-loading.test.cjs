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
  const exports = {};
  class Clock extends Date { static now() { return now; } }
  const loaders = Object.fromEntries(['Points','Areas','Buffers','Radar'].map(key => [`fetchHistorical${key}`, async () => {
    calls.push(key.toLowerCase());
    if (fail) throw new Error('TEST offline');
    return { type: 'FeatureCollection', features: [] };
  }]));
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/pages/map/historicalLayerCache.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: () => loaders, Date: Clock });
  return { api: exports, calls, time: value => { now = value; }, fail: value => { fail = value; } };
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
