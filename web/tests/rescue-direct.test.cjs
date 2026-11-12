const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '../src');

const payload = (overrides = {}) => ({
  id: 'TEST-SOS', residentId: 'TEST-RESIDENT', status: 'submitted', state: 'active',
  location: { latitude: 16.0544, longitude: 108.2022 },
  initialLocation: { latitude: 16.05, longitude: 108.2 },
  situations: ['trapped', 'injured'], numberOfPeople: 3, waterLevel: 'waist', note: 'TEST ONLY',
  locationCapturedAt: null, locationReceivedAt: '2026-11-12T01:00:00.000Z',
  createdAt: '2026-11-12T01:00:00.000Z', updatedAt: '2026-11-12T01:00:00.000Z',
  completedBy: null, completedAt: null, ...overrides,
});
const body = (data, status = 200, extra = {}) => new Response(JSON.stringify({
  success: status < 400, data, ...extra,
}), { status });

function loader(fetch, token = 'TEST-TOKEN') {
  const modules = new Map();
  function load(filename) {
    const file = path.join(root, filename);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    let source = fs.readFileSync(file, 'utf8');
    if (filename.endsWith('rescueService.ts')) {
      source = source.replace(/const RAW_API_URL =[\s\S]*?const API_BASE/, 'const RAW_API_URL = "https://test.invalid/api/";\nconst API_BASE');
    }
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    }}).outputText;
    vm.runInNewContext(code, {
      exports, URLSearchParams, Date, AbortController, setTimeout, clearTimeout,
      localStorage: { getItem: () => token }, fetch,
      require: name => load(path.normalize(path.join(path.dirname(filename), name + '.ts'))),
    }, { filename });
    return exports;
  }
  return {
    service: load('api/rescueService.ts'),
    contract: load('api/rescueDirectContract.ts'),
    labels: load('pages/rescue/sosDirect.ts'),
  };
}

test('read contract uses state and newest/oldest with one /api and Bearer token', async () => {
  const calls = [];
  const { service: { rescueService: s } } = loader(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/history')) return body({ requestId: 'TEST-SOS', statusHistory: [] });
    if (url.includes('?')) return body({ rescueRequests: [payload()] });
    return body({ rescueRequest: payload() });
  });
  const rows = await s.getRescueRequests({ state: 'active', sort: 'newest' });
  await s.getRescueDetail('TEST-SOS');
  await s.getHistory('TEST-SOS');
  assert.equal(rows[0].state, 'active');
  assert.equal(rows[0].urgency, undefined);
  assert.equal(calls[0].url, 'https://test.invalid/api/rescue-requests?state=active&sort=newest');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer TEST-TOKEN');
  assert.equal(calls.length, 3);
  assert(calls.every(call => !call.url.includes('/api/api')));
});

test('empty list is valid; invalid envelopes and duplicate or wrong-id results fail', async () => {
  const s = loader(async () => body({ rescueRequests: [] })).service.rescueService;
  assert.equal((await s.getRescueRequests()).length, 0);
  for (const value of [{}, { rescueRequests: null }, { rescueRequests: [null] }, { rescueRequests: [payload(), payload()] }]) {
    await assert.rejects(loader(async () => body(value)).service.rescueService.getRescueRequests());
  }
  await assert.rejects(loader(async () => body({ rescueRequest: payload({ id: 'OTHER' }) })).service.rescueService.getRescueDetail('TEST-SOS'));
  await assert.rejects(loader(async () => new Response('<html>bad gateway</html>')).service.rescueService.getRescueRequests());
  await assert.rejects(loader(async () => body({ rescueRequests: [payload({ state: 'rescued' })] })).service.rescueService.getRescueRequests({ state: 'active' }));
});

test('legacy nulls and malformed coordinates never invent state, GPS or urgency', () => {
  const { contract: c, labels } = loader(() => {});
  const legacy = c.parseDirectSos({ id: 'TEST-LEGACY', status: 'cancelled' });
  assert.equal(legacy.state, null);
  assert.equal(legacy.location, null);
  assert.equal(legacy.completedAt, null);
  assert.equal(legacy.numberOfPeople, null);
  assert.equal(legacy.situations, null);
  assert.equal(labels.situationsLabel(null), 'Chưa có thông tin');
  for (const point of [{ latitude: '16', longitude: 108 }, { latitude: 91, longitude: 108 }, { latitude: NaN, longitude: 108 }]) {
    assert.equal(c.parseSosLocation(point), null);
  }
  assert.equal(c.parseSosLocation({ latitude: 0, longitude: 0 }).latitude, 0);
  assert.equal(c.parseDirectSos(payload({ status: 'received', state: 'active' })).state, 'active');
  assert.equal(c.parseDirectSos(payload({ status: 'cancelled', state: 'legacy_other' })).state, 'legacy_other');
});

test('reject old queries; convert Vietnam date bounds to explicit UTC milliseconds', () => {
  const { contract: c, labels } = loader(() => {});
  for (const filters of [{ sort: 'priority' }, { urgency: 'high' }, { search: 'x' }, { page: '1' }, { status: 'submitted' }, { from: '2026-11-12' }]) {
    assert.throws(() => c.directSosQuery(filters));
  }
  assert.equal(labels.dateBoundary('2026-11-12', false), '2026-11-11T17:00:00.000Z');
  assert.equal(labels.dateBoundary('2026-11-12', true), '2026-11-12T16:59:59.999Z');
  assert.throws(() => c.directSosQuery({ from: '2026-11-13T00:00:00Z', to: '2026-11-12T00:00:00Z' }));
});

test('completion writes only assisted and trimmed note; server confirmer/time retained', async () => {
  const calls = [];
  const rescued = payload({ state: 'rescued', status: 'assisted', completedBy: 'TEST-RESCUE', completedAt: '2026-11-12T02:00:00.000Z' });
  const { service } = loader(async (url, init) => {
    calls.push({ url, init });
    return body({ rescueRequest: rescued, assignment: null });
  });
  const result = await service.confirmRescued('TEST-SOS', '  TEST completion  ');
  assert.equal(result.kind, 'confirmed');
  assert.equal(result.request.completedBy, 'TEST-RESCUE');
  assert.equal(result.request.completedAt, rescued.completedAt);
  assert.equal(calls[0].init.method, 'PATCH');
  assert.equal(calls[0].url, 'https://test.invalid/api/rescue-requests/TEST-SOS/status');
  assert.deepEqual(JSON.parse(calls[0].init.body), { status: 'assisted', note: 'TEST completion' });
  await assert.rejects(service.confirmRescued('TEST-SOS', '😀'.repeat(101)), error => error.status === 400);
  assert.equal(calls.length, 1);
});

test('409 conflict reads true confirmer; never repeats PATCH or reports own success', async () => {
  const calls = [];
  const { service } = loader(async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'PATCH') return body(null, 409, { code: 'STATUS_TRANSITION_CONFLICT', message: 'Conflict' });
    return body({ rescueRequest: payload({ state: 'rescued', status: 'assisted', completedBy: 'OTHER-TEST-RESCUE' }) });
  });
  const result = await service.confirmRescued('TEST-SOS', '');
  assert.equal(result.kind, 'reconciled');
  assert.equal(result.request.completedBy, 'OTHER-TEST-RESCUE');
  assert.equal(calls.filter(call => call.init.method === 'PATCH').length, 1);
  assert.equal(calls.length, 2);
});

test('timeout or 500 reconciles detail; an unknown result is never success', async () => {
  for (const writeStatus of [0, 500]) {
    let writes = 0;
    const { service } = loader(async (_url, init) => {
      if (init.method === 'PATCH') {
        writes++;
        if (!writeStatus) throw new Error('TEST offline');
        return body(null, 500);
      }
      return body({ rescueRequest: payload() });
    });
    const result = await service.confirmRescued('TEST-SOS', '');
    assert.equal(result.kind, 'reconciled');
    assert.equal(result.request.state, 'active');
    assert.equal(writes, 1);
  }
  const { service } = loader(async () => { throw new Error('TEST offline'); });
  await assert.rejects(service.confirmRescued('TEST-SOS', ''), /Chưa xác định được kết quả/);
});

test('401/403/404/400 are preserved; missing session never sends a write', async () => {
  for (const status of [400, 401, 403, 404]) {
    let calls = 0;
    const { service } = loader(async () => { calls++; return body(null, status, { code: 'TEST_ERROR' }); });
    await assert.rejects(service.confirmRescued('TEST-SOS', ''), error => error.status === status);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const { service } = loader(async () => { calls++; }, null);
  await assert.rejects(service.confirmRescued('TEST-SOS', ''), error => error.status === 401);
  assert.equal(calls, 0);
});

function hookHarness(load) {
  let state;
  let cleanup;
  const refs = [];
  const timers = new Map();
  const listeners = new Map();
  let timerId = 0;
  let refIndex = 0;
  const document = {
    hidden: false,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
  };
  class RescueApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'pages/rescue/useRescue.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, document, Date, AbortController, Error,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    require: name => name === 'react' ? {
      useState: initial => {
        if (state === undefined) state = initial;
        return [state, next => { state = typeof next === 'function' ? next(state) : next; }];
      },
      useRef: initial => { const i = refIndex++; return refs[i] ?? (refs[i] = { current: initial }); },
      useCallback: callback => callback,
      useEffect: effect => { cleanup = effect(); },
    } : name.includes('AuthContext') ? { useAuth: () => ({ token: 'TEST-TOKEN' }) } : { RescueApiError },
  });
  const result = exports.useSosResource('TEST', load);
  return {
    result, timers, document, listeners, RescueApiError,
    state: () => state,
    hide: () => { document.hidden = true; listeners.get('visibilitychange')(); },
    show: () => { document.hidden = false; listeners.get('visibilitychange')(); },
    tick: () => { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); },
    stop: () => cleanup(),
  };
}
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

test('poll serializes refreshes, pauses hidden tab and aborts on leaving screen', async () => {
  const pending = [];
  const signals = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const h = hookHarness(signal => {
    signals.push(signal);
    concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
    return new Promise(resolve => pending.push(value => { concurrent--; resolve(value); }));
  });
  h.result.refresh(); h.result.refresh();
  assert.equal(signals.length, 1);
  pending.shift()([payload()]);
  await flush();
  h.tick();
  assert.equal(signals.length, 2);
  h.hide();
  pending.shift()([payload({ location: { latitude: 17, longitude: 109 } })]);
  await flush();
  assert.equal(h.timers.size, 0);
  h.show();
  assert.equal(signals.length, 3);
  h.stop();
  assert.equal(signals[2].aborted, true);
  assert.equal(maxConcurrent, 1);
});

test('poll keeps markers on network failure, then replaces list when SOS completed elsewhere', async () => {
  let round = 0;
  const h = hookHarness(async () => {
    round++;
    if (round === 2) throw new Error('TEST offline');
    return round === 1 ? [payload()] : [];
  });
  await flush();
  const initial = h.state().data;
  h.tick(); await flush();
  assert.equal(h.state().data, initial);
  assert.equal(h.state().error, 'TEST offline');
  h.tick(); await flush();
  assert.equal(h.state().data.length, 0);
  assert.equal(h.state().error, null);
  h.stop();
});

test('poll discards protected data after forbidden response and stops automatic retries', async () => {
  let round = 0;
  let h;
  h = hookHarness(async () => {
    if (++round === 1) return [payload()];
    throw new h.RescueApiError('Forbidden', 403);
  });
  await flush();
  h.tick(); await flush();
  assert.equal(h.state().data, null);
  assert.equal(h.state().updatedAt, null);
  assert.equal(h.state().status, 403);
  assert.equal(h.timers.size, 0);
  h.stop();
});
