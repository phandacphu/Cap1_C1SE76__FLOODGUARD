import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }

function load(path) {
  const file = resolve(webRoot, path);
  if (modules.has(file)) return modules.get(file).exports;
  const output = { exports: {} };
  modules.set(file, output);
  const js = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
    reportDiagnostics: true,
  });
  assert.equal(js.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length ?? 0, 0);
  const requireLocal = (specifier) => {
    if (specifier === "../../../api/http") return { ApiError };
    if (specifier.startsWith("./")) return load(resolve(dirname(file), specifier + ".ts").slice(webRoot.length + 1));
    throw new Error(`Unexpected dependency: ${specifier}`);
  };
  new Function("require", "module", "exports", js.outputText)(requireLocal, output, output.exports);
  return output.exports;
}

const { validateSafeLocationDraft } = load("src/pages/admin/safe-location/safeLocationValidation.ts");
const { createSafeLocationDemo } = load("src/pages/admin/safe-location/safeLocationDemo.ts");
const base = { name: "Điểm A", address: "Địa chỉ A", type: "shelter", description: "", latitude: "0", longitude: "0" };

test("required fields fail independently; whitespace is not a name or address", () => {
  const { fields, errors } = validateSafeLocationDraft({ ...base, name: "   ", address: "\n", type: "wrong" });
  assert.equal(fields, null);
  assert.ok(errors.name && errors.address && errors.type);
});

test("coordinate validation rejects missing, invalid, infinite and out-of-range input", () => {
  const cases = [
    { latitude: "", longitude: "0" },
    { latitude: "91", longitude: "0" },
    { latitude: "-91", longitude: "0" },
    { latitude: "0", longitude: "181" },
    { latitude: "0", longitude: "-181" },
    { latitude: "Infinity", longitude: "0" },
    { latitude: "abc", longitude: "0" },
    { latitude: "0", longitude: "" },
  ];
  for (const coords of cases) {
    assert.equal(validateSafeLocationDraft({ ...base, ...coords }).fields, null, JSON.stringify(coords));
  }
});

test("boundary coordinates and zero are valid; optional description is null; text is trimmed", () => {
  const { fields, errors } = validateSafeLocationDraft({ ...base, name: "  Tên  ", address: " Địa chỉ ", latitude: "-90", longitude: "180" });
  assert.deepEqual(Object.keys(errors), []);
  assert.deepEqual(fields, { name: "Tên", address: "Địa chỉ", type: "shelter", description: null,
    location: { latitude: -90, longitude: 180 } });
  assert.deepEqual(validateSafeLocationDraft(base).fields?.location, { latitude: 0, longitude: 0 });
});

test("demo creates, edits by stable ID and hides soft-deleted record", async () => {
  const source = createSafeLocationDemo([]);
  assert.equal(source.demo, true);
  assert.deepEqual(await source.list(), []);
  const fields = validateSafeLocationDraft(base).fields;
  assert.ok(fields);
  const made = await source.save(null, fields);
  assert.ok(made.id.startsWith("TEST-SAFE-"));
  assert.equal((await source.list()).length, 1);
  const moved = await source.save(made.id, { ...fields, location: { latitude: 16.05, longitude: 108.2 } });
  assert.equal(moved.id, made.id);
  assert.deepEqual((await source.list())[0].location, { latitude: 16.05, longitude: 108.2 });
  assert.equal((await source.get(made.id)).id, made.id);
  await source.remove(made.id);
  assert.deepEqual(await source.list(), []);
  await assert.rejects(source.get(made.id), (error) => error.status === 404);
  await assert.rejects(source.save(made.id, fields), (error) => error.status === 404);
  await assert.rejects(source.remove(made.id), (error) => error.status === 404);
});

test("Admin route uses official API v2, no mock fallback; mock remains isolated", () => {
  const app = readFileSync(resolve(webRoot, "src/App.tsx"), "utf8");
  const screen = readFileSync(resolve(webRoot, "src/pages/admin/safe-location/SafeLocationManagementScreen.tsx"), "utf8");
  assert.match(app, /SafeLocationManagementScreen source=\{safeLocationApi\}/);
  assert.doesNotMatch(app, /SafeLocationManagementScreen source=\{safeLocationDemoSource\}/);
  assert.match(screen, /\["Tên địa điểm", "Địa chỉ", "Loại", "Tọa độ", "Thao tác"\]/);
  assert.doesNotMatch(screen, /KpiCard|Công suất|Sức chứa|Kích hoạt/);
  assert.match(screen, /"Chưa có điểm an toàn"/);
  assert.match(screen, /"Quản lý điểm an toàn"/);
  const navigation = readFileSync(resolve(webRoot, "src/components/layout/navConfig.ts"), "utf8");
  assert.match(navigation, /label: "Quản lý điểm an toàn"/);
  assert.match(screen, /"Chưa thể cập nhật"/);
  assert.match(screen, /source\.get\(selectedId\)/);
});


test("failed edit/delete do not mutate demo records", async () => {
  const source = createSafeLocationDemo([]);
  const fields = validateSafeLocationDraft(base).fields;
  assert.ok(fields);
  const created = await source.save(null, fields);
  const initial = await source.list();
  await assert.rejects(source.save("UNKNOWN", fields), (error) => error.status === 404);
  await assert.rejects(source.remove("UNKNOWN"), (error) => error.status === 404);
  assert.deepEqual(await source.list(), initial);
  await source.remove(created.id);
  assert.deepEqual(await source.list(), []);
});


test("v2 UTF-16 length limits and description validation appear per field", () => {
  assert.ok(validateSafeLocationDraft({ ...base, name: "x".repeat(201) }).errors.name);
  assert.ok(validateSafeLocationDraft({ ...base, address: "x".repeat(501) }).errors.address);
  assert.ok(validateSafeLocationDraft({ ...base, description: "x".repeat(2001) }).errors.description);
  assert.ok(validateSafeLocationDraft({ ...base, name: "😀".repeat(100) }).fields);
  assert.ok(validateSafeLocationDraft({ ...base, name: "😀".repeat(101) }).errors.name);
});
