const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../src");
const fixture = JSON.parse(
  readFileSync(path.join(root, "pages/rescue/warnings/warningFixtures.json")),
);
const { loader } = require("./helpers/rescue-warning-loader.cjs");
const load = loader(),
  data = load("pages/rescue/warnings/warningData.ts");
const clone = (value) => structuredClone(value);
const tick = async () => {
  for (let i = 0; i < 4; i++)
    await new Promise((resolve) => setImmediate(resolve));
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function harness(file, name, initialProps, stubs = {}) {
  const slots = [];
  let cursor = 0,
    effects = [],
    result,
    props = initialProps;
  const equal = (a, b) =>
    a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] = typeof initial === "function" ? initial() : initial;
      return [
        slots[i],
        (value) => {
          slots[i] = typeof value === "function" ? value(slots[i]) : value;
        },
      ];
    },
    useRef(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: value };
      return slots[i];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    },
  };
  const component = loader({ ...stubs, react: hooks })(file)[name];
  return {
    render(next = props) {
      props = next;
      cursor = 0;
      effects = [];
      result = Array.isArray(props) ? component(...props) : component(props);
      effects.forEach((run) => run());
      return result;
    },
    get result() {
      return result;
    },
    unmount() {
      slots.forEach((value) => value?.cleanup?.());
    },
  };
}
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree?.props) return [];
  return [tree, ...elements(tree.props.children)];
}
const text = (tree) =>
  Array.isArray(tree)
    ? tree.map(text).join(" ")
    : tree?.props
      ? text(tree.props.children)
      : typeof tree === "string" || typeof tree === "number"
        ? String(tree)
        : "";
const find = (tree, type, name) =>
  elements(tree).find((el) => el.type === type && text(el).includes(name));

test("Rescue fixtures exactly match approved V2 JSON scenarios", () => {
  const official = JSON.parse(
    readFileSync(
      path.resolve(__dirname, "../../docs/examples/flood-warning-v2.json"),
    ),
  );
  assert.deepEqual(
    fixture.list,
    official.scenarios.find(
      (s) => s.name === "resident-list-two-active-and-history",
    ).response,
  );
  assert.deepEqual(
    fixture.zones,
    official.scenarios.find(
      (s) => s.name === "zones-current-history-radar-and-admin-low",
    ).response,
  );
});
test("multiple active, nullable endAt, newest order, all results, content search and GMT+7", () => {
  const rows = data.parseWarningList(clone(fixture.list));
  assert.deepEqual(
    Array.from(rows, (r) => r.id),
    ["TEST-WARN-V2-002", "TEST-WARN-V2-001", "TEST-WARN-V2-OLD"],
  );
  assert.equal(data.filterWarnings(rows, "active", "").length, 2);
  assert.equal(data.filterWarnings(rows, "inactive", "").length, 1);
  assert.equal(data.filterWarnings(rows, "all", "KHÔNG PHẢI").length, 3);
  assert.equal(data.filterWarnings(rows, "all", "missing").length, 0);
  const many = Array.from({ length: 37 }, (_, i) => ({
    ...rows[0],
    id: `TEST-${String(i).padStart(2, "0")}`,
  }));
  assert.equal(data.filterWarnings(many, "active", "").length, 37);
  assert.equal(data.warningTime(null), "Chưa kết thúc");
  assert.match(data.warningTime("2026-11-22T01:00:00Z"), /08:00/);
});
test("wrong schema, missing endAt and duplicate IDs are errors rather than empty lists", () => {
  for (const mutate of [
    (x) => {
      x.data.schemaVersion = 1;
    },
    (x) => {
      delete x.data.floodAlerts[0].endAt;
    },
    (x) => {
      x.data.floodAlerts.push(x.data.floodAlerts[0]);
    },
    (x) => {
      x.data.floodAlerts[2].endAt = null;
    },
  ]) {
    const raw = clone(fixture.list);
    mutate(raw);
    assert.throws(() => data.parseWarningList(raw));
  }
  const empty = clone(fixture.list);
  empty.data.floodAlerts = [];
  assert.equal(data.parseWarningList(empty).length, 0);
  assert.throws(() =>
    data.parseWarningDetail(
      {
        success: true,
        data: {
          floodAlert: fixture.list.data.floodAlerts[0],
          serverTime: fixture.list.data.serverTime,
        },
      },
      "OTHER",
    ),
  );
});
test("map keeps radar/admin low-lying, holes/MultiPolygon, diagnostics and null metadata; toggles only view", () => {
  const raw = clone(fixture.zones),
    polygon = raw.data.geojson.features[0].geometry.coordinates;
  raw.data.geojson.features[0].geometry = {
    type: "MultiPolygon",
    coordinates: [polygon],
  };
  polygon.push([
    [108.202, 16.052],
    [108.203, 16.052],
    [108.203, 16.053],
    [108.202, 16.052],
  ]);
  const missing = { ...clone(raw.data.geojson.features[3]), geometry: null };
  missing.properties = {
    ...missing.properties,
    zoneId: "history:POINT-ONLY",
    geometryStatus: "missing",
    name: null,
    source: null,
    recordedAt: null,
  };
  raw.data.geojson.features.push(missing);
  Object.assign(raw.data.coverage, {
    status: "partial",
    totalZones: 5,
    unassessableZones: [
      {
        zoneId: "history:POINT-ONLY",
        sourceKind: "historical_area",
        reason: "missing_outline",
      },
    ],
  });
  const bundle = data.parseZoneBundle(raw),
    low = data.visibleZones(bundle, ["low_lying"]);
  assert.deepEqual(Array.from(low, (f) => f.properties.sourceKind).sort(), [
    "admin_area",
    "radar",
  ]);
  assert.equal(
    data.visibleZones(bundle, [
      "current_flood",
      "low_lying",
      "historical_flood",
    ]).length,
    4,
  );
  assert.equal(data.visibleZones(bundle, []).length, 0);
  assert.equal(bundle.geojson.features[0].geometry.coordinates[0].length, 2);
  assert.equal(bundle.geojson.features[4].geometry, null);
  assert.equal(bundle.geojson.features[4].properties.recordedAt, null);
  assert.equal(bundle.coverage.totalZones, 5);
  const invalid = clone(fixture.zones);
  invalid.data.geojson.features[3].geometry = {
    type: "Point",
    coordinates: [108, 16],
  };
  assert.throws(() => data.parseZoneBundle(invalid));
});
test("fixture source is read only; exact detail ID/404/abort; no HTTP", async () => {
  const source = load(
    "pages/rescue/warnings/warningDemo.ts",
  ).createRescueWarningDemo(0);
  assert.deepEqual(Object.keys(source).sort(), [
    "active",
    "demo",
    "detail",
    "list",
    "zones",
  ]);
  const controller = new AbortController();
  assert.equal((await source.list(controller.signal)).length, 3);
  assert.equal(
    (await source.detail("TEST-WARN-V2-OLD", controller.signal)).status,
    "inactive",
  );
  await assert.rejects(
    source.detail("missing", controller.signal),
    (error) => error.status === 404,
  );
  assert.equal(
    (await source.zones(controller.signal)).coverage.evaluableZones,
    4,
  );
  controller.abort();
  await assert.rejects(source.list(controller.signal));
});
test("loading, failed refresh preserves data, retry reconciles deactivation", async () => {
  let mode = "active";
  const get = async () => {
    if (mode === "error") throw new Error("500");
    return [{ id: "A", status: mode }];
  };
  const view = harness(
    "pages/rescue/warnings/useWarningResource.ts",
    "useWarningResource",
    ["session", get],
  );
  assert.equal(view.render().loading, true);
  await tick();
  assert.equal(view.render().data[0].status, "active");
  mode = "error";
  view.result.refresh();
  assert.equal(view.render().data[0].id, "A");
  await tick();
  assert.equal(view.render().error, "500");
  assert.equal(view.result.data[0].status, "active");
  mode = "inactive";
  view.result.refresh();
  view.render();
  await tick();
  assert.equal(view.render().data[0].status, "inactive");
  assert.equal(view.result.error, null);
  view.unmount();
});
test("401/403/404 clear stale resources instead of presenting unauthorized data", async () => {
  for (const status of [401, 403, 404]) {
    let failed = false;
    const get = async () => {
      if (failed) throw new data.WarningReadError("test", status);
      return ["private"];
    };
    const view = harness(
      "pages/rescue/warnings/useWarningResource.ts",
      "useWarningResource",
      ["session", get],
    );
    view.render();
    await tick();
    assert.equal(view.render().data[0], "private");
    failed = true;
    view.result.refresh();
    view.render();
    await tick();
    assert.equal(view.render().data, null);
    assert.ok(view.result.error);
    assert.equal(view.result.loading, false);
    view.unmount();
  }
});
test("late response cannot overwrite new session/detail, even if source ignores abort", async () => {
  const late = deferred(),
    newest = deferred(),
    oldLoad = () => late.promise,
    newLoad = () => newest.promise;
  const view = harness(
    "pages/rescue/warnings/useWarningResource.ts",
    "useWarningResource",
    ["user-A:detail-A", oldLoad],
  );
  view.render();
  await tick();
  assert.equal(view.render(["user-B:detail-B", newLoad]).data, null);
  await tick();
  newest.resolve(["B"]);
  await tick();
  assert.equal(view.render().data[0], "B");
  late.resolve(["A"]);
  await tick();
  assert.equal(view.render().data[0], "B");
  assert.equal(view.render(["", newLoad]).data, null);
  view.unmount();
});
test("same-session source replacement hides old data; older refresh never wins", async () => {
  const pending = deferred();
  let call = 0;
  const first = async () => ["old source"];
  const second = () =>
    ++call === 1 ? pending.promise : Promise.resolve(["newest"]);
  const view = harness(
    "pages/rescue/warnings/useWarningResource.ts",
    "useWarningResource",
    ["session", first],
  );
  view.render();
  await tick();
  view.render();
  assert.equal(view.render(["session", second]).data, null);
  await tick();
  view.result.refresh();
  view.render();
  await tick();
  assert.equal(view.render().data[0], "newest");
  pending.resolve(["late"]);
  await tick();
  assert.equal(view.render().data[0], "newest");
  view.unmount();
});
test("actual list handlers filter all/active/inactive with no mutation actions", () => {
  const list = {
    data: data.parseWarningList(clone(fixture.list)),
    error: null,
    loading: false,
    updatedAt: new Date(),
    refresh() {},
  };
  const view = harness(
    "pages/rescue/warnings/RescueWarnings.tsx",
    "RescueWarningPage",
    {},
    {
      "./WarningContext": {
        useWarnings: () => ({ list, source: { demo: true } }),
        useWarningList: () => list,
      },
      "../../map/FloodMapView": { FloodMapView: () => null },
      "../../../components/layout/RescueLayout": { RescueLayout: () => null },
      "./RescueWarningMap": { RescueWarningMap: () => null },
      "react-router-dom": {
        Link: "a",
        useParams: () => ({}),
        useSearchParams: () => [new URLSearchParams()],
      },
    },
  );
  const cards = () =>
    elements(view.result).filter((el) => el.type === "article");
  view.render();
  assert.equal(cards().length, 3);
  find(view.result, "button", "Đang bật").props.onClick();
  view.render();
  assert.equal(cards().length, 2);
  find(view.result, "button", "Đã tắt").props.onClick();
  view.render();
  assert.equal(cards().length, 1);
  elements(view.result)
    .find((el) => el.type === "input")
    .props.onChange({ target: { value: "no matching bulletin" } });
  view.render();
  assert.match(text(view.result), /Không có bản tin khớp bộ lọc/);
  find(view.result, "button", "Xóa bộ lọc").props.onClick();
  view.render();
  assert.equal(cards().length, 3);
  for (const forbidden of [
    "Tạo cảnh báo",
    "Chỉnh sửa",
    "Tắt cảnh báo",
    "Bật lại",
    "Xóa bản tin",
    "Mức độ",
  ])
    assert.equal(text(view.result).includes(forbidden), false);
});
test("banner shows total active, newest, null endAt and link to all", () => {
  const list = {
    data: data.parseWarningList(clone(fixture.list)),
    error: null,
    loading: false,
  };
  const view = harness(
    "pages/rescue/components/FloodAlertBanner.tsx",
    "FloodAlertBanner",
    {},
    {
      "../warnings/WarningContext": { useWarnings: () => ({ list }) },
      "react-router-dom": { Link: "a" },
    },
  );
  assert.match(text(view.render()), /2\s+bản tin đang bật/);
  assert.match(text(view.result), /Bản tin đang bật thứ hai/);
  assert.match(text(view.result), /Chưa kết thúc/);
  assert.equal(
    find(view.result, "a", "Xem đầy đủ").props.to,
    "/rescue/flood-warnings",
  );
});
test("feedback distinguishes first error, stale refresh and retry", () => {
  const Feedback = load(
    "pages/rescue/warnings/WarningFeedback.tsx",
  ).WarningFeedback;
  let retries = 0;
  const resource = {
    data: ["cached"],
    error: "500",
    loading: false,
    refresh() {
      retries++;
    },
  };
  let tree = Feedback({ resource, noun: "bản tin" });
  assert.match(text(tree), /Chưa thể cập nhật/);
  find(tree, "button", "Thử lại").props.onClick();
  assert.equal(retries, 1);
  tree = Feedback({ resource: { ...resource, data: null }, noun: "bản tin" });
  assert.match(text(tree), /Chưa tải được bản tin/);
  assert.equal(text(tree).includes("Đang hiển thị dữ liệu"), false);
});

test("detail loads selected ID, refreshes without false fallback, and marks inactive map as current", async () => {
  let current = clone(fixture.list.data.floodAlerts[0]);
  const selected = [],
    source = {
      async detail(id) {
        selected.push(id);
        return current;
      },
    };
  const view = harness(
    "pages/rescue/warnings/RescueWarnings.tsx",
    "WarningDetail",
    { id: current.id, refreshKey: 0 },
    {
      "./WarningContext": {
        useWarnings: () => ({ source, identity: "session" }),
      },
      "../../map/FloodMapView": { FloodMapView: "ZonesMap" },
      "../../../components/layout/RescueLayout": { RescueLayout: () => null },
      "./RescueWarningMap": { RescueWarningMap: () => null },
      "react-router-dom": {
        Link: "a",
        useParams: () => ({}),
        useSearchParams: () => [new URLSearchParams()],
      },
    },
  );
  view.render();
  await tick();
  assert.match(text(view.render()), /Chưa kết thúc/);
  assert.equal(
    find(view.result, "a", "Xem vùng trên bản đồ").props.to,
    `/map?warning=${encodeURIComponent(current.id)}`,
  );
  current = { ...current, status: "inactive", endAt: "2026-11-22T03:00:00Z" };
  view.render({ id: current.id, refreshKey: 1 });
  await tick();
  view.render();
  assert.match(text(view.result), /Kết thúc/);
  assert.equal(selected.length, 2);
  assert.ok(selected.every((id) => id === current.id));
  view.unmount();
});


test("empty data differs from no filter match in actual list screen", () => {
  const list = {
    data: [],
    error: null,
    loading: false,
    updatedAt: new Date(),
    refresh() {},
  };
  const view = harness(
    "pages/rescue/warnings/RescueWarnings.tsx",
    "RescueWarningPage",
    {},
    {
      "./WarningContext": {
        useWarnings: () => ({ list, source: { demo: true } }),
        useWarningList: () => list,
      },
      "../../map/FloodMapView": { FloodMapView: () => null },
      "../../../components/layout/RescueLayout": { RescueLayout: () => null },
      "./RescueWarningMap": { RescueWarningMap: () => null },
      "react-router-dom": {
        Link: "a",
        useParams: () => ({}),
        useSearchParams: () => [new URLSearchParams()],
      },
    },
  );
  assert.match(text(view.render()), /Chưa có bản tin/);
  assert.equal(
    text(view.result).includes("Không có bản tin khớp bộ lọc"),
    false,
  );
});

test("HTTP adapter sends only GET with the captured JWT and exact V2 paths/query", async () => {
  const calls = [],
    signal = new AbortController().signal;
  const factory = load(
    "pages/rescue/warnings/warningApi.ts",
  ).createRescueWarningApi;
  const transport = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url),
      tail = parsed.pathname.split("/").at(-1);
    let body = clone(fixture.list);
    if (tail === "zones") body = clone(fixture.zones);
    else if (tail.startsWith("TEST-WARN"))
      body = {
        success: true,
        data: {
          floodAlert: clone(fixture.list.data.floodAlerts[0]),
          serverTime: fixture.list.data.serverTime,
        },
      };
    else if (tail === "active" || parsed.searchParams.get("status"))
      body.data.floodAlerts = body.data.floodAlerts.filter(
        (row) => row.status === (parsed.searchParams.get("status") || "active"),
      );
    return { ok: true, status: 200, json: async () => body };
  };
  const api = factory("TEST-JWT-ONLY", "https://fixture.test/api/", transport);
  await api.list(signal);
  await api.list(signal, { status: "active", q: "mưa lớn & ngập" });
  await api.list(signal, { status: "inactive" });
  await api.active(signal);
  await api.detail("TEST-WARN-V2-002", signal);
  await api.zones(signal);
  assert.equal(calls[0].url, "https://fixture.test/api/flood-alerts");
  assert.equal(new URL(calls[1].url).searchParams.get("q"), "mưa lớn & ngập");
  assert.equal(new URL(calls[1].url).searchParams.get("status"), "active");
  assert.equal(
    calls[2].url,
    "https://fixture.test/api/flood-alerts?status=inactive",
  );
  assert.equal(calls[3].url, "https://fixture.test/api/flood-alerts/active");
  assert.equal(
    calls[4].url,
    "https://fixture.test/api/flood-alerts/TEST-WARN-V2-002",
  );
  assert.equal(calls[5].url, "https://fixture.test/api/flood-alerts/zones");
  for (const call of calls) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.headers.Authorization, "Bearer TEST-JWT-ONLY");
    assert.equal(call.options.cache, "no-store");
    assert.equal(call.options.body, undefined);
    assert.doesNotMatch(
      call.url,
      /severity|areaId|bbox|limit|page|\/admin|notification-devices|location-evaluation/,
    );
  }
});

test("HTTP adapter rejects malformed V1, authenticates, preserves status/code, and handles cancellation/timeout", async () => {
  const factory = load(
    "pages/rescue/warnings/warningApi.ts",
  ).createRescueWarningApi;
  const signal = new AbortController().signal;
  await assert.rejects(
    factory(null, "https://fixture.test/api", () => {
      throw new Error("must not fetch");
    }).list(signal),
    (error) => error.status === 401,
  );
  for (const status of [401, 403, 404, 500, 503]) {
    const api = factory("test", "https://fixture.test/api", async () => ({
      ok: false,
      status,
      json: async () => ({
        success: false,
        code: status === 403 ? "ACCOUNT_INACTIVE" : "TEST_ERROR",
      }),
    }));
    await assert.rejects(
      api.detail("TEST", signal),
      (error) =>
        error.status === status &&
        error.code === (status === 403 ? "ACCOUNT_INACTIVE" : "TEST_ERROR"),
    );
  }
  await assert.rejects(
    factory("test", "https://fixture.test/api", async () => ({
      ok: true,
      json: async () => ({ success: true, data: { floodAlerts: [] } }),
    })).list(signal),
  );
  const timed = factory(
    "test",
    "https://fixture.test/api",
    (_url, opts) =>
      new Promise((_, reject) =>
        opts.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        ),
      ),
    1,
  );
  await assert.rejects(
    timed.zones(signal),
    (error) =>
      error.code === "NETWORK_ERROR" && /thời gian chờ/.test(error.message),
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    timed.list(controller.signal),
    (error) => error.name === "AbortError",
  );
});

test("401 feedback offers explicit reauthentication and clears the expired auth session on action", () => {
  const Feedback = load(
    "pages/rescue/warnings/WarningFeedback.tsx",
  ).WarningFeedback;
  const tree = Feedback({
    noun: "bản tin",
    resource: {
      data: null,
      error: "Phiên đăng nhập hết hạn",
      errorStatus: 401,
      loading: false,
      refresh() {},
    },
  });
  assert.ok(elements(tree).some((el) => el.type === "SessionAction"));
  let loggedOut = false,
    navigated = null;
  const Action = loader({
    "../../../context/AuthContext": {
      useAuth: () => ({
        logout() {
          loggedOut = true;
        },
      }),
    },
    "react-router-dom": {
      useNavigate: () => (path) => {
        navigated = path;
      },
    },
  })("pages/rescue/warnings/WarningSessionAction.tsx").WarningSessionAction;
  find(Action(), "button", "Đăng nhập lại").props.onClick();
  assert.equal(loggedOut, true);
  assert.equal(navigated, "/login");
});

test("query switch and leaving screen abort pending adapter calls and never reveal old results", async () => {
  const requests = [],
    factory = load(
      "pages/rescue/warnings/warningApi.ts",
    ).createRescueWarningApi;
  const api = factory(
    "test",
    "https://fixture.test/api",
    (_url, options) =>
      new Promise((resolve, reject) => {
        requests.push(options.signal);
        options.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      }),
  );
  const active = (signal) => api.list(signal, { status: "active" });
  const inactive = (signal) => api.list(signal, { status: "inactive" });
  const view = harness(
    "pages/rescue/warnings/useWarningResource.ts",
    "useWarningResource",
    ["session/active", active],
  );
  view.render();
  await tick();
  assert.equal(requests.length, 1);
  view.render(["session/inactive", inactive]);
  await tick();
  assert.equal(requests[0].aborted, true);
  assert.equal(view.result.data, null);
  view.unmount();
  assert.equal(requests[1].aborted, true);
});

test("leaving and returning to the same screen cannot present old success as fresh", async () => {
  const get = async () => ["old success"];
  const view = harness(
    "pages/rescue/warnings/useWarningResource.ts",
    "useWarningResource",
    ["session", get],
  );
  view.render();
  await tick();
  assert.equal(view.render().data[0], "old success");
  view.render(["", get]);
  const returning = view.render(["session", get]);
  assert.equal(returning.data, null);
  assert.equal(returning.loading, true);
  view.unmount();
});



test("existing map renderer draws all three V2 groups without inventing geometry, and switches off all overlays", () => {
  const rendered = [],
    popups = [];
  const leaflet = {
    geoJSON(feature, options) {
      rendered.push({ feature, options });
      options.onEachFeature(feature, {
        bindPopup(node) {
          popups.push(node);
        },
      });
      return { addTo() {} };
    },
  };
  const document = {
    createElement(tag) {
      return {
        tag,
        textContent: "",
        children: [],
        append(...nodes) {
          this.children.push(...nodes);
        },
      };
    },
  };
  const renderer = loader(
    { leaflet },
    { document },
  )("pages/map/publishedFloodLayers.ts");
  const raw = clone(fixture.zones);
  raw.data.geojson.features[0].properties.name = "<img src=x onerror=alert(1)>";
  const original = clone(raw.data.geojson.features[0].geometry.coordinates);
  const bundle = data.parseZoneBundle(raw);
  let clears = 0,
    closed = 0;
  const map = {
    closePopup() {
      closed++;
    },
    fitBounds() {
      throw new Error("Drawing/toggling must not move the camera");
    },
  };
  const group = {
    clearLayers() {
      clears++;
    },
  };
  renderer.drawPublishedFloodZones(map, group, bundle, true);
  assert.equal(rendered.length, 4);
  assert.equal(
    new Set(rendered.map((item) => item.feature.properties.group)).size,
    3,
  );
  assert.deepEqual(rendered[0].feature.geometry.coordinates, original);
  assert.equal(
    rendered.find((item) => item.feature.properties.group === "current_flood")
      .options.pane,
    "warning-current_flood",
  );
  const history = rendered.find(
    (item) => item.feature.properties.group === "historical_flood",
  );
  assert.equal(history.options.style.dashArray, "8 6");
  assert.equal(
    popups[0].children[0].children[1].textContent,
    "<img src=x onerror=alert(1)>",
  );
  assert.equal(popups[0].children[0].children[1].children.length, 0);
  assert.equal(
    data
      .zoneMetadataRows(bundle.geojson.features[1].properties)
      .some((row) => row.label.includes("GMT+7")),
    false,
  );
  renderer.drawPublishedFloodZones(map, group, bundle, false);
  assert.equal(rendered.length, 4);
  assert.equal(clears, 2);
  assert.equal(closed, 2);
});

test("shared old map canvas preserves Da Nang camera, tile options, recovery and cleanup", () => {
  const handlers = {},
    events = new Map();
  let observerDisconnected = false,
    removed = false,
    redraws = 0,
    invalidates = 0;
  let initial, tileOptions, tileUrl;
  const panes = {},
    map = {
      createPane(name) {
        panes[name] = { style: {} };
        return panes[name];
      },
      invalidateSize() {
        invalidates++;
      },
      remove() {
        removed = true;
      },
    };
  const tile = {
    on(name, callback) {
      handlers[name] = callback;
    },
    off() {
      Object.keys(handlers).forEach((k) => delete handlers[k]);
    },
    addTo() {},
    redraw() {
      redraws++;
    },
  };
  const leaflet = {
    map(_container, options) {
      initial = options;
      return map;
    },
    tileLayer(url, options) {
      tileUrl = url;
      tileOptions = options;
      return tile;
    },
    layerGroup() {
      return {
        addTo() {
          return this;
        },
      };
    },
  };
  class ResizeObserver {
    observe() {}
    disconnect() {
      observerDisconnected = true;
    }
  }
  const window = {
    addEventListener(name, fn) {
      events.set(name, fn);
    },
    removeEventListener(name) {
      events.delete(name);
    },
  };
  const factory = loader(
    { leaflet },
    { window, ResizeObserver },
  )("pages/map/floodMapCanvas.ts");
  const counts = [];
  const canvas = factory.createFloodMapCanvas(
    {},
    {
      mapTilerKey: "TEST ONLY",
      zoom: 13,
      historyPanes: true,
      onTileErrorCount: (count) => counts.push(count),
    },
  );
  assert.deepEqual(Array.from(initial.center), [16.0544, 108.2022]);
  assert.equal(initial.zoom, 13);
  assert.match(tileUrl, /streets-v4/);
  assert.equal(tileOptions.tileSize, 512);
  assert.equal(tileOptions.zoomOffset, -1);
  assert.equal(panes["flood-history"].style.zIndex, "390");
  const tileNode = {};
  handlers.tileerror({ tile: tileNode });
  handlers.tileload({ tile: tileNode });
  assert.deepEqual(counts, [1, 0]);
  events.get("online")();
  assert.equal(redraws, 1);
  assert.equal(invalidates, 1);
  canvas.dispose();
  assert.equal(removed, true);
  assert.equal(observerDisconnected, true);
  assert.equal(events.has("online"), false);
});

test("partial coverage explains unclassified regions in Vietnamese without changing Backend classification", () => {
  const raw = clone(fixture.zones);
  const unknown = clone(raw.data.geojson.features[0]);
  unknown.geometry = null;
  Object.assign(unknown.properties, {
    zoneId: "admin:TEST-UNCLASSIFIED",
    group: null,
    geometryStatus: "invalid",
    name: "TEST Chưa phân loại",
  });
  raw.data.geojson.features.push(unknown);
  Object.assign(raw.data.coverage, {
    status: "partial",
    totalZones: 5,
    unassessableZones: [
      {
        zoneId: unknown.properties.zoneId,
        sourceKind: "admin_area",
        reason: "unclassified_area",
      },
    ],
  });
  const bundle = data.parseZoneBundle(raw);
  const Notice = load(
    "pages/rescue/warnings/ZoneCoverageNotice.tsx",
  ).ZoneCoverageNotice;
  const tree = Notice({ bundle });
  assert.match(text(tree), /4\/5 vùng có ranh giới hợp lệ/);
  assert.match(
    text(find(tree, "p", "chưa được phân loại")),
    /1 vùng chưa được phân loại/,
  );
  assert.doesNotMatch(text(tree), /unclassified_area|admin_area/);
  assert.match(text(tree), /TEST Chưa phân loại/);
  assert.match(text(tree), /Mã vùng:.*admin:TEST-UNCLASSIFIED/);
  assert.equal(
    elements(tree).find((el) => el.type === "details").props.open,
    undefined,
  );
  assert.equal(bundle.geojson.features.at(-1).geometry, null);
  assert.equal(bundle.geojson.features.at(-1).properties.group, null);
  assert.equal(
    data.visibleZones(bundle, [
      "current_flood",
      "low_lying",
      "historical_flood",
    ]).length,
    4,
  );
});

test("coverage source failures and unknown diagnostics never imply an empty safe dataset", () => {
  const module = load("pages/rescue/warnings/zoneCoverage.ts");
  const bundle = data.parseZoneBundle(clone(fixture.zones));
  bundle.coverage.status = "partial";
  bundle.coverage.unassessableZones = [
    { zoneId: null, sourceKind: "radar", reason: "source_unavailable" },
    { zoneId: "unknown", sourceKind: "future-source", reason: "future-reason" },
  ];
  const summary = module.coverageSummary(bundle);
  assert.match(summary, /1 nguồn dữ liệu chưa tải được/);
  const rows = module.coverageRows(bundle);
  assert.equal(rows[0].source, "Dữ liệu Radar");
  assert.equal(rows[1].reason, "Dữ liệu vùng cần được kiểm tra");
  bundle.coverage.status = "unavailable";
  assert.match(
    module.coverageSummary(bundle),
    /Không thể xem đây là khu vực không có nguy cơ/,
  );
  const Notice = load(
    "pages/rescue/warnings/ZoneCoverageNotice.tsx",
  ).ZoneCoverageNotice;
  bundle.coverage.status = "complete";
  assert.equal(Notice({ bundle }), null);
});
