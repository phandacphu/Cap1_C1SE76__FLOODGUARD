const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/pages/rescue/sosMapData.ts'), 'utf8');
const exportsMap = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText, { exports: exportsMap });
const { hasMapLocation, directionsUrl, SOS_MAP_COLORS } = exportsMap;

test('SOS map only uses valid latest location and preserves zero coordinates', () => {
  assert.equal(hasMapLocation({ location: { latitude: 0, longitude: 0 } }), true);
  for (const location of [null, { latitude: 91, longitude: 108 }, { latitude: 16, longitude: NaN }]) {
    assert.equal(hasMapLocation({ location }), false);
    assert.equal(directionsUrl({ location }), null);
  }
  const item = { location: { latitude: 16, longitude: 108 }, initialLocation: { latitude: 1, longitude: 2 } };
  assert.match(directionsUrl(item), /destination=16,108$/);
  item.location = { latitude: 17, longitude: 109 };
  assert.match(directionsUrl(item), /destination=17,109$/);
});

test('SOS map state colors stay distinct from each other', () => {
  assert.notEqual(SOS_MAP_COLORS.active, SOS_MAP_COLORS.rescued);
  assert.notEqual(SOS_MAP_COLORS.legacy_other, SOS_MAP_COLORS.rescued);
});

test('six collocated SOS remain six distinct popup records at one exact GPS location', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ id: `TEST-${i}`, state: 'active', location: { latitude: 16, longitude: 108 } }));
  const groups = exportsMap.groupMapLocations(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 6);
  assert.equal(new Set(groups[0].items.map(item => item.id)).size, 6);
  assert.equal(groups[0].latitude, 16);
  assert.equal(groups[0].longitude, 108);
});
test('GPS movement regroups the same ID and uses its new directions without changing other SOS', () => {
  const rows = [{ id: 'TEST-1', location: { latitude: 16, longitude: 108 } }, { id: 'TEST-2', location: { latitude: 16, longitude: 108 } }, { id: 'TEST-NO-GPS', location: null }];
  assert.equal(exportsMap.groupMapLocations(rows).length, 1);
  rows[0].location = { latitude: 17, longitude: 109 };
  const groups = exportsMap.groupMapLocations(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups.find(group => group.items[0].id === 'TEST-1').latitude, 17);
  assert.match(directionsUrl(rows[0]), /destination=17,109$/);
  assert.equal(rows.length, 3);
});
