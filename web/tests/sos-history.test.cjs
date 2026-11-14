const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsMap = {};
const source = fs.readFileSync(path.join(__dirname, '../src/pages/admin/flood-area/historicalMapService.ts'), 'utf8')
  .replace('import.meta.env.VITE_API_URL', 'undefined');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText, { exports: exportsMap });
const { parseHistoricalCollection } = exportsMap;
const ring = [[108, 16], [108.1, 16], [108.1, 16.1], [108, 16]];
const body = (layer, geometry) => ({ success: true, data: { layer, geojson: { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { id: 'HIST-TEST', name: '<img src=x onerror=alert(1)>' }, geometry },
] } } });

test('SOS historical layers preserve separate geometries, holes and GeoJSON coordinate order', () => {
  for (const [layer, geometry] of [
    ['points', { type: 'Point', coordinates: [108,16] }],
    ['areas', { type: 'Polygon', coordinates: [ring, ring] }],
    ['buffers', { type: 'MultiPolygon', coordinates: [[ring]] }],
    ['radar', { type: 'MultiPolygon', coordinates: [[ring]] }],
  ]) {
    const parsed = parseHistoricalCollection(body(layer, geometry), layer);
    assert.deepEqual(parsed.features[0].geometry, geometry);
    assert.equal(parsed.features[0].properties.id, 'HIST-TEST');
  }
});

test('SOS history rejects invalid rings and wrong layers; empty successful snapshots remove deleted HIST', () => {
  assert.throws(() => parseHistoricalCollection(body('radar', { type: 'Polygon', coordinates: [ring] }), 'areas'));
  assert.throws(() => parseHistoricalCollection(body('areas', { type: 'Polygon', coordinates: [ring.slice(0,3)] }), 'areas'));
  assert.throws(() => parseHistoricalCollection(body('points', { type: 'Point', coordinates: [108,99] }), 'points'));
  const empty = { success: true, data: { layer: 'areas', geojson: { type: 'FeatureCollection', features: [] } } };
  assert.equal(parseHistoricalCollection(empty, 'areas').features.length, 0);
});

test('captured public Render historical payloads pass the actual map parser', { skip: !process.env.SOS_MAP_LIVE_DIR }, () => {
  for (const layer of ['points', 'areas', 'buffers', 'radar']) {
    const body = JSON.parse(fs.readFileSync(path.join(process.env.SOS_MAP_LIVE_DIR, `${layer}.json`), 'utf8'));
    const parsed = parseHistoricalCollection(body, layer);
    assert.equal(parsed.features.length, body.data.geojson.features.length);
  }
});
