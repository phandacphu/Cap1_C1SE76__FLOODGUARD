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

function hookHarness(load, merge) {
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
  const result = exports.useSosResource('TEST', load, merge);
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

test('HTTP 200 with malformed completion body reconciles once using the exact SOS ID', async () => {
  for (const rescueRequest of [null, {}, payload({ id: 'OTHER' })]) {
    const calls = [];
    const { service } = loader(async (url, init) => {
      calls.push({ url, init });
      if (init.method === 'PATCH') return body({ rescueRequest });
      return body({ rescueRequest: payload({
        state: 'rescued', status: 'assisted', completedBy: 'OTHER-RESCUER',
        completedAt: '2026-11-12T03:00:00.000Z',
      }) });
    });
    const result = await service.confirmRescued('TEST-SOS', '');
    assert.equal(result.kind, 'reconciled');
    assert.equal(result.request.completedBy, 'OTHER-RESCUER');
    assert.equal(calls[1].url, 'https://test.invalid/api/rescue-requests/TEST-SOS');
    assert.equal(calls.filter(call => call.init.method === 'PATCH').length, 1);
  }
});

test('malformed write followed by unknown or invalid detail remains an uncertain result', async () => {
  for (const value of [null, payload({ state: null }), payload({ id: 'OTHER' })]) {
    const { service } = loader(async (_url, init) =>
      body({ rescueRequest: init.method === 'PATCH' ? null : value }));
    await assert.rejects(service.confirmRescued('TEST-SOS', ''), error => error.status === 0);
  }
});

test('detail uses embedded history and flags malformed history without a second read', async () => {
  const calls = [];
  const event = { id: 'event', oldStatus: null, newStatus: 'submitted', changedBy: 'TEST-RESIDENT', changedAt: '2026-11-12T01:00:00Z', note: null };
  const { service } = loader(async url => {
    calls.push(url);
    return body({ rescueRequest: { ...payload(), statusHistory: [event] } });
  });
  const item = await service.rescueService.getRescueDetail('TEST-SOS');
  assert.equal(item.statusHistory[0].id, 'event');
  assert.equal(item.historyError, null);
  assert.equal(calls.length, 1);
  const bad = loader(async () => body({ rescueRequest: { ...payload(), statusHistory: {} } }));
  const invalid = await bad.service.rescueService.getRescueDetail('TEST-SOS');
  assert.equal(invalid.id, 'TEST-SOS');
  assert.equal(invalid.statusHistory, null);
  assert.match(invalid.historyError, /lịch sử/);
});

test('new GET updates GPS/directions data after completion; stale snapshots cannot roll it back', () => {
  const { labels } = loader(() => {});
  assert.equal(typeof labels.coordsLabel, 'function');
  const file = path.join(root, 'pages/rescue/sosDetailData.ts');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date });
  const old = { ...payload({
    state: 'rescued', status: 'assisted', updatedAt: '2026-11-12T02:00:00Z',
    completedBy: 'TEST-RESCUE', completedAt: '2026-11-12T02:00:00Z',
  }), statusHistory: [], historyError: null };
  const fresh = { ...old, location: { latitude: 17, longitude: 109 },
    updatedAt: '2026-11-12T03:00:00Z', locationReceivedAt: '2026-11-12T03:00:00Z' };
  const current = exports.mergeSosDetail(old, fresh);
  assert.equal(current.location.latitude, 17);
  assert.equal(exports.mergeSosDetail(current, old), current);
  assert.equal(exports.applySosCompletion(current, old), current);
  assert.equal(exports.mergeSosDetail(current, { ...old, state: 'active' }), current);
});

test('late pre-mutation GET is discarded; a GET started after completion replaces the immediate update', async () => {
  const pending = [];
  const signals = [];
  const h = hookHarness(signal => {
    signals.push(signal);
    return new Promise(resolve => pending.push(resolve));
  });
  pending.shift()({ id: 'TEST', state: 'active' }); await flush();
  h.tick();
  const finish = h.result.beginUpdate();
  assert.equal(signals[1].aborted, true);
  finish(() => ({ id: 'TEST', state: 'rescued', location: 'PATCH' }));
  assert.equal(h.state().data.location, 'PATCH');
  pending.shift()({ id: 'TEST', state: 'active', location: 'OLD' }); await flush();
  assert.equal(h.state().data.location, 'PATCH');
  h.tick();
  pending.shift()({ id: 'TEST', state: 'rescued', location: 'NEW GET' }); await flush();
  assert.equal(h.state().data.location, 'NEW GET');
  h.stop();
});

test('a paused write blocks polling and a late response after leaving detail cannot publish data', async () => {
  const pending = [];
  let calls = 0;
  const h = hookHarness(() => {
    calls++;
    return new Promise(resolve => pending.push(resolve));
  });
  pending.shift()({ id: 'TEST' }); await flush();
  const finish = h.result.beginUpdate();
  h.result.refresh(); h.hide(); h.show();
  assert.equal(calls, 1);
  assert.equal(h.timers.size, 0);
  const before = h.state();
  h.stop();
  finish(() => ({ id: 'TEST', state: 'rescued' }));
  assert.equal(h.state(), before);
});

function feedbackHarness() {
  const exports = {};
  const session = { token: 'OLD', user: { role: 'RESCUE_STAFF' } };
  const actions = [];
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'pages/rescue/components/DirectSosFeedback.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: name => name === 'react/jsx-runtime' ? require(name)
      : name === 'react-router-dom' ? { useNavigate: () => path => actions.push(['navigate', path, session.token, session.user]) }
      : { useAuth: () => ({ logout: () => { session.token = null; session.user = null; actions.push(['logout']); } }) },
  });
  return { exports, session, actions };
}

function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  const children = tree.props?.children;
  return [tree, ...[children].flat(Infinity).flatMap(elements)];
}

test('401 login button clears the old session before navigation, including completion errors', () => {
  for (const error of ['401 khi tải SOS', '401 khi xác nhận']) {
    const h = feedbackHarness();
    const tree = h.exports.DirectSosFeedback({ error, status: 401, stale: false, loading: false, retry: () => {} });
    const login = elements(tree).find(item => item.type === 'button' && item.props.children === 'Đăng nhập lại');
    login.props.onClick();
    assert.equal(h.session.token, null);
    assert.equal(h.session.user, null);
    assert.equal(h.actions[0][0], 'logout');
    assert.equal(h.actions[1][1], '/login');
    assert.equal(h.actions[1][2], null);
    assert.equal(h.actions[1][3], null);
  }
});

function detailHarness(confirm) {
  const state = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const api = loader(() => {}).service;
  const result = {
    request: { ...payload(), statusHistory: [], historyError: null },
    history: [], historyError: null, data: null,
    error: null, status: null, loading: false, updatedAt: new Date(), revision: 1,
    refresh: () => {},
    beginUpdate: () => update => {
      if (update) result.request = update(result.request);
    },
  };
  const mergeExports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'pages/rescue/sosDetailData.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: mergeExports, Date });
  const labelExports = loader(() => {}).labels;
  const exports = {};
  const source = fs.readFileSync(path.join(root, 'pages/rescue/RescueSosDetail.tsx'), 'utf8')
    .replace('function SosDetail(', 'export function SosDetail(');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Error,
    window: { confirm: () => true },
    require: name => {
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react') return {
        useRef: initial => { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
        useState: initial => {
          const index = stateIndex++;
          if (!(index in state)) state[index] = initial;
          return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
        },
      };
      if (name.includes('react-router')) return { Link: 'a', useParams: () => ({ id: 'TEST-SOS' }) };
      if (name.includes('AuthContext')) return { useAuth: () => ({ user: { role: 'RESCUE_STAFF' } }) };
      if (name.endsWith('rescueService')) return { ...api, confirmRescued: confirm };
      if (name.endsWith('useRescueDetail')) return { useRescueDetail: () => result };
      if (name.endsWith('sosDetailData')) return mergeExports;
      if (name.endsWith('sosDirect')) return labelExports;
      return new Proxy({}, { get: (_target, key) => String(key) });
    },
  });
  const render = () => {
    stateIndex = 0; refIndex = 0;
    return elements(exports.SosDetail({ id: 'TEST-SOS' }));
  };
  return {
    api, result, render,
    button: () => render().find(item => item.type === 'button' && item.props.children === 'Xác nhận đã cứu'),
  };
}

test('PATCH 403/404 retains readable detail after a successful refresh but disables writing', async () => {
  for (const status of [403, 404]) {
    let h;
    h = detailHarness(async () => { throw new h.api.RescueApiError('TEST write denied', status); });
    h.button().props.onClick();
    await flush();
    h.result.request = { ...h.result.request, location: { latitude: 17, longitude: 109 } };
    h.result.revision++;
    const tree = h.render();
    assert(tree.some(item => item.type === 'h1'));
    assert(tree.some(item => typeof item.props?.href === 'string' && item.props.href.includes('17%2C109')));
    assert.equal(h.button().props.disabled, true);
    h.result.request = null; h.result.status = status; h.result.error = 'TEST read denied';
    assert.equal(h.render().some(item => item.type === 'h1'), false);
  }
});

test('401 during completion hides protected detail and exposes the relogin feedback', async () => {
  let h;
  h = detailHarness(async () => { throw new h.api.RescueApiError('TEST expired', 401); });
  h.button().props.onClick();
    await flush();
  const tree = h.render();
  assert.equal(tree.some(item => item.type === 'h1'), false);
  assert(tree.some(item => item.type === 'DirectSosFeedback' && item.props.status === 401));
});

test('immediate completion data yields to the next GET including directions; double clicks only write once', async () => {
  let resolve;
  let writes = 0;
  const h = detailHarness(() => {
    writes++;
    return new Promise(done => { resolve = done; });
  });
  const button = h.button();
  const sending = button.props.onClick();
  await button.props.onClick();
  assert.equal(writes, 1);
  resolve({ kind: 'confirmed', request: payload({
    state: 'rescued', status: 'assisted', completedBy: 'TEST-RESCUER',
    completedAt: '2026-11-12T02:00:00Z', updatedAt: '2026-11-12T02:00:00Z',
  }), message: 'TEST confirmed' });
  await sending;
  await flush();
  h.result.request = { ...h.result.request, location: { latitude: 18, longitude: 110 }, updatedAt: '2026-11-12T03:00:00Z' };
  h.result.revision++;
  const tree = h.render();
  assert(tree.some(item => item.props?.href?.includes('18%2C110')));
  assert.equal(h.button(), undefined);
});

test('uncertain completion stays locked until a valid fresh state is read', async () => {
  let h;
  h = detailHarness(async () => { throw new h.api.RescueApiError('Unknown result', 0); });
  h.button().props.onClick();
    await flush();
  assert.equal(h.button().props.disabled, true);
  h.result.revision++;
  h.result.request = { ...h.result.request, state: null };
  assert.equal(h.button(), undefined);
  h.result.request = { ...h.result.request, state: 'active' };
  assert.equal(h.button().props.disabled, false);
});

test('a rejected stale snapshot cannot mark uncertain data freshly reconciled', async () => {
  let value = { version: 2 };
  const h = hookHarness(async () => value, (current, incoming) =>
    current && current.version > incoming.version ? current : incoming);
  await flush();
  const revision = h.state().revision;
  const timestamp = h.state().updatedAt;
  value = { version: 1 };
  h.tick(); await flush();
  assert.equal(h.state().data.version, 2);
  assert.equal(h.state().revision, revision);
  assert.equal(h.state().updatedAt, timestamp);
  assert.match(h.state().error, /cũ hơn/);
  h.stop();
});

test('detail hook creates one polling resource and reads embedded history without /history', async () => {
  let polls = 0;
  const calls = [];
  const fixture = { ...payload(), statusHistory: [{ id: 'TEST-EVENT' }], historyError: null };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'pages/rescue/useRescueDetail.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let load;
  vm.runInNewContext(code, {
    exports,
    require: name => {
      if (name === 'react') return { useCallback: fn => fn };
      if (name.endsWith('rescueService')) return {
        rescueService: {
          getRescueDetail: async id => { calls.push(['detail', id]); return fixture; },
          getHistory: async () => { calls.push(['history']); },
        },
      };
      if (name.endsWith('sosDetailData')) return { mergeSosDetail: (_current, incoming) => incoming };
      return { useSosResource: (_key, fn) => { polls++; load = fn; return { data: fixture }; } };
    },
  });
  const result = exports.useRescueDetail('TEST-SOS');
  await load(new AbortController().signal);
  await load(new AbortController().signal);
  assert.equal(polls, 1);
  assert.deepEqual(calls, [['detail', 'TEST-SOS'], ['detail', 'TEST-SOS']]);
  assert.equal(result.history, fixture.statusHistory);
});

test('late PATCH result cannot replace newer GPS already received by detail', async () => {
  let resolve;
  const h = detailHarness(() => new Promise(done => { resolve = done; }));
  h.button().props.onClick();
  const fresh = { ...h.result.request, state: 'rescued', status: 'assisted',
    location: { latitude: 19, longitude: 111 }, updatedAt: '2026-11-12T05:00:00Z',
    completedAt: '2026-11-12T02:00:00Z', completedBy: 'TEST-RESCUE' };
  h.result.request = fresh;
  h.result.revision++;
  resolve({ kind: 'confirmed', request: payload({
    state: 'rescued', status: 'assisted', updatedAt: '2026-11-12T02:00:00Z',
    completedAt: '2026-11-12T02:00:00Z', completedBy: 'TEST-RESCUE',
  }), message: 'TEST confirmed' });
  await flush();
  assert.equal(h.result.request, fresh);
  assert(h.render().some(item => item.props?.href?.includes('19%2C111')));
});
