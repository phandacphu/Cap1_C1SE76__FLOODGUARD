import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Render the REAL area form with a mock map component; no network or browser token needed.
const temp = await mkdtemp(fileURLToPath(new URL("../.ui-smoke-", import.meta.url)));
const compile = (source, filename) => ts.transpileModule(source, {
  fileName: filename,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const files = new URL("../src/pages/admin/flood-area/", import.meta.url);
const typesCode = await readFile(new URL("floodAreaTypes.ts", files), "utf8");
const formCode = await readFile(new URL("components/AreaFormModal.tsx", files), "utf8");
const patchImports = (js) => js
  .replace('"./PolygonDrawMap"', '"./PolygonDrawMap.mjs"')
  .replace('"../floodAreaTypes"', '"./floodAreaTypes.mjs"');

try {
  await writeFile(`${temp}/floodAreaTypes.mjs`, compile(typesCode, "floodAreaTypes.ts"));
  await writeFile(`${temp}/PolygonDrawMap.mjs`, `import React from "react";\nexport function PolygonDrawMap(props) { return React.createElement("div", {"data-test-polygon-locked": String(!!props.disabled)}, "Bản đồ vẽ đa giác"); }\n`);
  await writeFile(`${temp}/AreaFormModal.mjs`, patchImports(compile(formCode, "AreaFormModal.tsx")));
  const { AreaFormModal } = await import(pathToFileURL(join(temp, "AreaFormModal.mjs")).href);
  const mapSource = (await readFile(new URL("components/PolygonDrawMap.tsx", files), "utf8"))
    .replace('import "leaflet/dist/leaflet.css";', "");
  const compiledMap = compile(mapSource, "PolygonDrawMap.tsx")
    .replace('"react-leaflet"', '"./mockReactLeaflet.mjs"')
    .replace('"leaflet"', '"./mockLeaflet.mjs"')
    .replace('"../floodAreaTypes"', '"./floodAreaTypes.mjs"');
  await writeFile(`${temp}/mockLeaflet.mjs`, 'export default { divIcon: (data) => data, latLngBounds: (data) => data };');
  await writeFile(`${temp}/mockReactLeaflet.mjs`, `import React from "react";
    const silent = () => null;
    export const TileLayer = silent;
    export const CircleMarker = silent;
    export const Polygon = silent;
    export const Polyline = silent;
    export function MapContainer({ children }) { return React.createElement("section", {}, children); }
    export function Marker({ draggable, eventHandlers }) {
      globalThis.__pr114MapCapture.markers.push({ draggable, eventHandlers });
      return React.createElement("i");
    }
    export function useMap() { return { fitBounds() {} }; }
    export function useMapEvents(events) { globalThis.__pr114MapCapture.click = events.click; }
  `);
  await writeFile(`${temp}/PolygonDrawMapReal.mjs`, compiledMap);
  const { PolygonDrawMap: RealPolygonDrawMap } = await import(pathToFileURL(join(temp, "PolygonDrawMapReal.mjs")).href);
  const previewCode = await readFile(new URL("components/PolygonPreview.tsx", files), "utf8");
  await writeFile(`${temp}/PolygonPreview.mjs`, compile(previewCode, "PolygonPreview.tsx"));
  const { PolygonPreview } = await import(pathToFileURL(join(temp, "PolygonPreview.mjs")).href);
  const create = (busy, timeoutUncertain) => renderToStaticMarkup(React.createElement(AreaFormModal, {
    area: null, busy, timeoutUncertain, onVerifyTimeout: () => {},
    serverError: timeoutUncertain ? "Kết quả có thể chưa xác định" : null,
    onSubmit: () => {}, onClose: () => {}, referencePoints: [],
  }));

  test("polygon preview refuses any invalid vertex instead of dropping it", () => {
    const points = [
      { latitude: 16.05, longitude: 108.2 }, { latitude: 16.07, longitude: 108.2 },
      { latitude: 16.05, longitude: 108.22 }, { latitude: NaN, longitude: 108.21 },
    ];
    const html = renderToStaticMarkup(React.createElement(PolygonPreview, { points }));
    assert.match(html, /Không thể xem trước/);
    assert.doesNotMatch(html, /<polygon/);
  });

  test("drawing map blocks click-to-add and drag while saving", () => {
    const initial = [
      { latitude: 16.05, longitude: 108.2 },
      { latitude: 16.07, longitude: 108.2 },
      { latitude: 16.05, longitude: 108.22 },
    ];
    const changed = [];
    globalThis.__pr114MapCapture = { markers: [], click: null };
    const html = renderToStaticMarkup(React.createElement(RealPolygonDrawMap, {
      points: initial, onChange: (next) => changed.push(next), disabled: true,
    }));
    assert.ok(globalThis.__pr114MapCapture.markers.every((marker) => !marker.draggable));
    globalThis.__pr114MapCapture.click({ latlng: { lat: 16.08, lng: 108.23 } });
    globalThis.__pr114MapCapture.markers[0].eventHandlers.dragend({
      target: { getLatLng: () => ({ lat: 16.09, lng: 108.24 }) },
    });
    assert.equal(changed.length, 0);
    assert.match(html, /Đang lưu vùng/);
    assert.match(html, /disabled/);
  });

  test("drawing map accepts click-to-add and drag before saving", () => {
    const initial = [{ latitude: 16.05, longitude: 108.2 }];
    const changed = [];
    globalThis.__pr114MapCapture = { markers: [], click: null };
    renderToStaticMarkup(React.createElement(RealPolygonDrawMap, {
      points: initial, onChange: (next) => changed.push(next), disabled: false,
    }));
    assert.ok(globalThis.__pr114MapCapture.markers.every((marker) => marker.draggable));
    globalThis.__pr114MapCapture.click({ latlng: { lat: 16.06, lng: 108.21 } });
    globalThis.__pr114MapCapture.markers[0].eventHandlers.dragend({
      target: { getLatLng: () => ({ lat: 16.07, lng: 108.22 }) },
    });
    assert.equal(changed.length, 2);
    assert.deepEqual(changed[0].at(-1), { latitude: 16.06, longitude: 108.21 });
    assert.deepEqual(changed[1][0], { latitude: 16.07, longitude: 108.22 });
  });

  test("saving locks polygon editor and disables save/cancel controls", () => {
    const html = create(true, false);
    assert.match(html, /data-test-polygon-locked="true"/);
    assert.match(html, /Đang lưu\.\.\./);
    assert.match(html, /<fieldset[^>]*disabled/);
    assert.match(html, /<button[^>]*disabled[^>]*>Đang lưu\.\.\.<\/button>/);
  });

  test("normal mode keeps polygon editor active", () => {
    const html = create(false, false);
    assert.match(html, /data-test-polygon-locked="false"/);
    assert.match(html, />Tạo vùng<\/button>/);
  });

  test("timeout offers read-only verification and prevents immediate resubmit", () => {
    const html = create(false, true);
    assert.match(html, /Đọc lại danh sách vùng \(không gửi lại\)/);
    assert.match(html, /không tự gửi lại POST\/PATCH/);
    assert.match(html, /<button[^>]*disabled[^>]*>Hãy kiểm tra trước khi lưu lại<\/button>/);
  });
} finally {
  // node:test executes registered test callbacks after this module finishes;
  // the compiled module was already imported before removal.
  await rm(temp, { recursive: true, force: true });
}
