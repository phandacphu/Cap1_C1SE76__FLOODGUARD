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
const { hasMapLocation, directionsUrl, areaAlert, SOS_MAP_COLORS } = exportsMap;

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

test('area severity uses only matching active and currently effective alerts', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  const alert = { areaId: 'TEST', status: 'active', severity: 'low', startAt: '2026-11-13T11:00:00Z', endAt: '2026-11-13T13:00:00Z' };
  const rows = [alert, { ...alert, severity: 'high' }, { ...alert, severity: 'critical', status: 'inactive' },
    { ...alert, severity: 'critical', areaId: 'OTHER' }, { ...alert, severity: 'critical', endAt: '2026-11-13T11:30:00Z' },
    { ...alert, severity: 'critical', startAt: '2026-11-14T11:00:00Z' }];
  assert.equal(areaAlert(rows, 'TEST', now).severity, 'high');
  assert.equal(areaAlert(rows, 'MISSING', now), null);
  assert.equal(areaAlert([], 'TEST', now), null);
  assert.notEqual(SOS_MAP_COLORS.active, SOS_MAP_COLORS.rescued);
  assert.notEqual(SOS_MAP_COLORS.legacy_other, SOS_MAP_COLORS.rescued);
});
