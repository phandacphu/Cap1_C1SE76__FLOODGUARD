import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

function loadPureTs(path) {
  const module = { exports: {} };
  const js = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  new Function("module", "exports", js.outputText)(module, module.exports);
  return module.exports;
}

const { historicalDescriptionLines } = loadPureTs("src/pages/admin/flood-area/historicalDescription.ts");
const { sosProgressIndex, newestSosFirst, SOS_PROGRESS_LABELS } = loadPureTs("src/pages/admin/sos/sosUiProgress.ts");

test("historical descriptions split each documented event without modifying saved text", () => {
  const description = "Ngày 14/10/2022 có nơi ngập 2,5 m; đợt 13–17/10/2023 có nơi ngập 1–2 m.";
  assert.deepEqual(historicalDescriptionLines(description), [
    "Ngày 14/10/2022 có nơi ngập 2,5 m",
    "đợt 13–17/10/2023 có nơi ngập 1–2 m.",
  ]);
  assert.equal(description.includes(";"), true);
  assert.deepEqual(historicalDescriptionLines("  Một mốc duy nhất.  "), ["Một mốc duy nhất."]);
  assert.deepEqual(historicalDescriptionLines(null), []);
});

test("SOS shows exactly the three requested stages, using Backend statuses only", () => {
  assert.deepEqual([...SOS_PROGRESS_LABELS], ["Đã tiếp nhận", "Đang cứu hộ", "Hoàn thành cứu hộ"]);
  assert.equal(sosProgressIndex({ condition: "active", status: "received" }), 0);
  assert.equal(sosProgressIndex({ condition: "active", status: "in_progress" }), 1);
  assert.equal(sosProgressIndex({ condition: "rescued", status: "assisted" }), 2);
  assert.equal(sosProgressIndex({ condition: "rescued", status: null, statusHistory: [] }), 2);
  assert.equal(sosProgressIndex({ condition: "active", status: "submitted", statusHistory: [
    { newStatus: "received" }, { newStatus: "in_progress" }, { newStatus: "submitted" },
  ] }), 1);
  assert.equal(sosProgressIndex({ condition: "active", status: "submitted", statusHistory: [] }), null);
});

test("SOS newest-first sort is deterministic, keeps missing dates last and does not mutate API data", () => {
  const original = [
    { id: "older", createdAt: "2026-10-01T00:00:00Z" },
    { id: "missing", createdAt: null },
    { id: "later-b", createdAt: "2026-11-01T00:00:00Z" },
    { id: "later-a", createdAt: "2026-11-01T00:00:00Z" },
  ];
  assert.deepEqual(newestSosFirst(original).map((item) => item.id), ["later-a", "later-b", "older", "missing"]);
  assert.equal(original[0].id, "older");
});

test("historical map hides three top notices, uses red GPS pins and renders descriptions safely", () => {
  const screen = source("src/pages/admin/flood-area/components/HistoricalMapScreen.tsx");
  assert.doesNotMatch(screen, /chưa phân loại nên chưa được vẽ/);
  assert.doesNotMatch(screen, /Dữ liệu ngập lịch sử phục vụ tham khảo/);
  assert.doesNotMatch(screen, /Làm mới vùng và lớp lịch sử/);
  assert.match(screen, /mapGpsPin\('red'\)/);
  assert.match(screen, /historicalDescriptionLines\(feature\.properties\.description\)/);
  assert.match(screen, /escapeHtml\(line\)/);
});

test("SOS and safe-location UI remove extra information while keeping API and marker interactions", () => {
  const monitoring = source("src/pages/admin/sos/SosMonitoringScreen.tsx");
  const detail = source("src/pages/admin/sos/SosDetailScreen.tsx");
  const overview = source("src/pages/admin/safe-location/SafeLocationMap.tsx");
  assert.match(monitoring, /sort: "newest"/);
  assert.doesNotMatch(monitoring, /aria-label="Thời gian gửi"/);
  assert.doesNotMatch(monitoring, /Trạng thái, khoảng ngày và thứ tự/);
  assert.doesNotMatch(detail, /Mã nhân viên xác nhận|Thời gian hoàn tất/);
  assert.doesNotMatch(detail, /event\.changedBy|event\.note/);
  assert.match(detail, /SOS_PROGRESS_LABELS\.map/);
  assert.match(overview, /mapGpsPin\("green"/);
  assert.match(overview, /onSelect\(location\.id\)/);
});
