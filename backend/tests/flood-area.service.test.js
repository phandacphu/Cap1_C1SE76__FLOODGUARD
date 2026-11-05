const assert = require('node:assert/strict');
const { test } = require('node:test');
// Substitute Firestore before loading the service; no Firebase app or real writes.
const records = new Map();
let nextId = 0;
const db = {
  collection(name) {
    return {
      doc(id = `local-${++nextId}`) {
        const key = `${name}/${id}`;
        return {
          id,
          async get() {
            const data = records.get(key);
            return { id, exists: data !== undefined, data: () => data };
          },
          async set(data) { records.set(key, { ...data }); },
        };
      },
      async get() {
        return { docs: [...records].filter(([key]) => key.startsWith(`${name}/`))
          .map(([key, data]) => ({ id: key.slice(name.length + 1), data: () => data })) };
      },
    };
  },
};
const firebasePath = require.resolve('../src/config/firebase');
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
const { normalizeFloodAreaData, readFloodAreaType, setFloodAreaById,
  getFloodAreaById, getFloodAreas, createFloodArea } = require('../src/services/flood-area.service');
function sample(areaType = 'flood') {
  return {
    name: '  Test area  ', description: '  Local test  ', areaType,
    geometry: { type: 'polygon', points: [
      { latitude: 16.05, longitude: 108.2 },
      { latitude: 16.06, longitude: 108.21 },
      { latitude: 16.04, longitude: 108.22 },
    ] }, source: '  test  ',
  };
}
test('accepts two area categories, normalizes text and omits obsolete fields', () => {
  for (const type of ['flood', 'low_lying']) {
    const data = normalizeFloodAreaData(sample(type));
    assert.equal(data.areaType, type);
    assert.equal(data.name, 'Test area');
    assert.equal(data.source, 'test');
    assert.equal(data.description, 'Local test');
    assert.equal(Object.hasOwn(data, 'status'), false);
    assert.equal(Object.hasOwn(data, 'severity'), false);
  }
});
test('does not guess missing or unsupported classification', () => {
  for (const areaType of [undefined, null, '', 'history', 'unclassified', 'FLOOD']) {
    assert.throws(() => normalizeFloodAreaData({ ...sample(), areaType }), /areaType/);
    assert.equal(readFloodAreaType(areaType), null);
  }
});
test('rejects obsolete fields even with a valid type', () => {
  for (const field of ['status', 'severity']) {
    assert.throws(() => normalizeFloodAreaData({ ...sample(), [field]: 'active' }), /no longer supported/);
  }
});
test('rejects malformed names, sources, descriptions and geometry', () => {
  for (const patch of [{ name: ' ' }, { source: '' }, { description: 123 },
    { geometry: null }, { geometry: { type: 'point', points: sample().geometry.points } },
    { geometry: { type: 'polygon', points: [] } }]) {
    assert.throws(() => normalizeFloodAreaData({ ...sample(), ...patch }));
  }
});
test('rejects non-numeric, non-finite and out-of-bounds coordinates', () => {
  for (const patch of [{ latitude: NaN }, { longitude: Infinity }, { latitude: 91 },
    { longitude: -181 }, { latitude: '16' }, { longitude: null }]) {
    const data = sample();
    data.geometry.points[0] = { ...data.geometry.points[0], ...patch };
    assert.throws(() => normalizeFloodAreaData(data));
  }
});
test('accepts missing descriptions without adding invented text', () => {
  assert.equal(normalizeFloodAreaData({ ...sample(), description: ' ' }).description, null);
  assert.equal(normalizeFloodAreaData({ ...sample(), description: null }).description, null);
});
test('explicit writes persist type and preserve creation time on replacement', async () => {
  const first = await setFloodAreaById('sample-local', sample('flood'));
  const updated = await setFloodAreaById('sample-local', sample('low_lying'));
  assert.equal(updated.areaType, 'low_lying');
  assert.equal(updated.createdAt, first.createdAt);
  assert.equal((await getFloodAreaById('sample-local')).areaType, 'low_lying');
  assert.equal(await getFloodAreaById('missing-local'), null);
});
test('create and list use only the in-memory Firestore substitute', async () => {
  const created = await createFloodArea(sample('flood'));
  assert.ok(created.id.startsWith('local-'));
  assert.ok((await getFloodAreas()).some(area => area.id === created.id && area.areaType === 'flood'));
});
