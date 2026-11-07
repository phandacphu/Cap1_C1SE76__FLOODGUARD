import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const root = new URL("../src/pages/admin/flood-area/", import.meta.url);
const code = (await readFile(new URL("historicalMapService.ts", root), "utf8"))
  .replace("import.meta.env.VITE_API_URL", '"https://unit.invalid/api"');
const compiled = ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const service = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const cases = [
  ["points", "FLOODGUARD_FLOODMAP.geojson", 27],
  ["buffers", "FLOODGUARD_FLOODMAP_BUFFERS.geojson", 2],
  ["radar", "FLOODGUARD_FLOODMAP_RADAR.geojson", 157],
];
const readFixture = async (filename) => JSON.parse(await readFile(new URL(`../../backend/data/flood-history/${filename}`, import.meta.url), "utf8"));
const wrap = (geojson, layer) => ({ success: true, data: { layer, geojson } });
const clone = (v) => structuredClone(v);

for (const [layer, filename, count] of cases) {
  test(`valid ${layer} GeoJSON fixture is accepted without dropping any feature`, async () => {
    const geojson = await readFixture(filename);
    const parsed = service.parseHistoricalCollection(wrap(geojson, layer), layer);
    assert.equal(parsed.features.length, count);
  });
  test(`${layer} rejects one invalid feature and the WHOLE layer`, async () => {
    const geojson = await readFixture(filename);
    const broken = clone(geojson);
    broken.features[broken.features.length - 1].geometry.coordinates = [[108, "bad"]];
    assert.throws(() => service.parseHistoricalCollection(wrap(broken, layer), layer), {
      name: "HistoricalApiError",
      message: new RegExp(`Feature ${broken.features.length}`),
    });
    assert.equal(geojson.features.length, count, "fixture not mutated");
  });
}

test("points rejects out-of-range and non-finite coordinates", async () => {
  const geo = await readFixture(cases[0][1]);
  for (const coordinates of [[108, 91], [181, 16], [108, Infinity], [108], [108, "16"]]) {
    const invalid = clone(geo);
    invalid.features[0].geometry.coordinates = coordinates;
    assert.throws(() => service.parseHistoricalCollection(wrap(invalid, "points"), "points"), /Feature 1/);
  }
});

test("points rejects malformed popup metadata before rendering", async () => {
  const geo = await readFixture(cases[0][1]);
  geo.features[0].properties.name = { x: "not safe to render" };
  assert.throws(() => service.parseHistoricalCollection(wrap(geo, "points"), "points"), /name/);
});

test("buffers rejects Polygon, radar accepts Polygon and MultiPolygon", async () => {
  const buffers = await readFixture(cases[1][1]);
  buffers.features[0].geometry.type = "Polygon";
  assert.throws(() => service.parseHistoricalCollection(wrap(buffers, "buffers"), "buffers"), /Feature 1/);
  const radar = await readFixture(cases[2][1]);
  assert.ok(radar.features.some((f) => f.geometry.type === "Polygon"));
  assert.ok(radar.features.some((f) => f.geometry.type === "MultiPolygon"));
  assert.equal(service.parseHistoricalCollection(wrap(radar, "radar"), "radar").features.length, 157);
});

test("a polygon with an invalid point or open ring is rejected, never repaired", async () => {
  const geo = await readFixture(cases[1][1]);
  const ring = geo.features[0].geometry.coordinates[0][0];
  ring[3] = [200, 16];
  assert.throws(() => service.parseHistoricalCollection(wrap(geo, "buffers"), "buffers"), /Feature 1/);
  const open = await readFixture(cases[2][1]);
  const first = open.features[0].geometry.coordinates[0][0];
  first[first.length - 1] = [108, 17];
  assert.throws(() => service.parseHistoricalCollection(wrap(open, "radar"), "radar"), /Feature 1/);
});

test("wrong layer name is rejected even when geometry happens to look valid", async () => {
  const geo = await readFixture(cases[0][1]);
  assert.throws(() => service.parseHistoricalCollection(wrap(geo, "radar"), "points"), /không đúng lớp/);
});

test("invalid collection and error response produce named layer errors", () => {
  assert.throws(() => service.parseHistoricalCollection(wrap({ type: "FeatureCollection", features: {} }, "points"), "points"), /Điểm ngập lịch sử/);
  assert.throws(() => service.parseHistoricalCollection({ success: false, message: "offline" }, "radar"), /Vùng phân tích radar/);
  assert.throws(() => service.parseHistoricalCollection(wrap({ type: "FeatureCollection", features: [{ type: "Feature", geometry: null }] }, "buffers"), "buffers"), /Feature 1/);
});

test("fetchers validate layer independently: invalid radar doesn't break points", async () => {
  const originalFetch = globalThis.fetch;
  const geoPoints = await readFixture(cases[0][1]);
  const badRadar = await readFixture(cases[2][1]);
  badRadar.features[1].geometry.coordinates = null;
  globalThis.fetch = async (url) => {
    const layer = String(url).includes("/radar") ? "radar" : "points";
    const geojson = layer === "radar" ? badRadar : geoPoints;
    return new Response(JSON.stringify(wrap(geojson, layer)), { status: 200 });
  };
  try {
    const [radar, points] = await Promise.allSettled([service.fetchHistoricalRadar(), service.fetchHistoricalPoints()]);
    assert.equal(radar.status, "rejected");
    assert.match(radar.reason.message, /Feature 2/);
    assert.equal(points.status, "fulfilled");
    assert.equal(points.value.features.length, 27);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
