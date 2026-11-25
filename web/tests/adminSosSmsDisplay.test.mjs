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

const { parseApiSos, parseApiList, parseApiDetail } = loadPureTs("src/pages/admin/sos/sosContract.ts");
const { formatSosSubmissionSource } = loadPureTs("src/pages/admin/sos/sosFormat.ts");
const base = { id: "TEST-SOS-001", state: "active", status: "received" };

test("SMS, app and missing SOS submission sources map to labels without changing data provenance", () => {
  for (const [raw, expected] of [["sms", "SMS"], ["api", "Ứng dụng"], [null, "Chưa rõ nguồn"], [undefined, "Chưa rõ nguồn"], ["other", "Chưa rõ nguồn"]]) {
    const item = parseApiSos({ ...base, source: raw });
    assert.equal(formatSosSubmissionSource(item.submissionSource), expected);
    assert.equal(item.source, "api");
  }
});

test("SMS contact and timestamps are optional, without inferring account or GPS receipt", () => {
  const empty = parseApiSos({ ...base, source: "sms", smsSenderPhone: null, smsReceivedAt: null });
  assert.equal(empty.smsSenderPhone, null);
  assert.equal(empty.smsReceivedAt, null);
  assert.equal(empty.senderName, null);
  assert.equal(empty.locationCapturedAt, null);
  assert.equal(empty.locationReceivedAt, null);
  const sms = parseApiSos({ ...base, source: "sms", smsSenderPhone: "+84900000000", smsReceivedAt: "2026-11-25T08:00:00Z" });
  assert.equal(sms.smsSenderPhone, "+84900000000");
  assert.equal(sms.smsReceivedAt, "2026-11-25T08:00:00Z");
  assert.equal(sms.locationCapturedAt, null);
  assert.equal(parseApiSos({ ...base, smsReceivedAt: "invalid" }).smsReceivedAt, null);
});

test("initial GPS stays separate from latest valid GPS and rescue completion", () => {
  const item = parseApiDetail({ rescueRequest: { ...base, state: "rescued", source: "sms",
    initialLocation: { latitude: 16.06, longitude: 108.2 },
    location: { latitude: 16.08, longitude: 108.21 },
    locationCapturedAt: "2026-11-25T08:03:00Z", locationReceivedAt: "2026-11-25T08:04:00Z",
    smsReceivedAt: "2026-11-25T08:00:00Z", completedBy: "RESCUE-1", completedAt: "2026-11-25T09:00:00Z",
  } });
  assert.notDeepEqual(item.initialLocation, item.location);
  assert.equal(item.locationCapturedAt, "2026-11-25T08:03:00Z");
  assert.equal(item.locationReceivedAt, "2026-11-25T08:04:00Z");
  assert.equal(item.condition, "rescued");
  assert.equal(item.completedBy, "RESCUE-1");
  assert.equal(item.completedAt, "2026-11-25T09:00:00Z");
  assert.equal(parseApiSos({ ...base, location: { latitude: 999, longitude: 0 } }).location, null);
});

test("list does not produce multiple rows for one SOS id", () => {
  assert.equal(parseApiList({ rescueRequests: [{ ...base, source: "sms" }] }).length, 1);
  assert.throws(() => parseApiList({ rescueRequests: [base, { ...base, source: "sms" }] }), /trùng lặp/);
});

test("SOS UI stays read-only and retains access/race safeguards", () => {
  const list = source("src/pages/admin/sos/SosMonitoringScreen.tsx");
  const detail = source("src/pages/admin/sos/SosDetailScreen.tsx");
  const map = source("src/pages/admin/sos/SosLocationMap.tsx");
  const resource = source("src/pages/admin/sos/useSosResource.ts");
  const api = source("src/pages/admin/sos/sosApi.ts");
  assert.match(list, /formatSosSubmissionSource\(item\.submissionSource\)/);
  for (const field of ["smsSenderPhone", "smsReceivedAt", "initialLocation", "locationCapturedAt", "locationReceivedAt", "completedBy", "completedAt"]) {
    assert.ok(detail.includes(`item.${field}`), `${field} must be visible in detail`);
  }
  assert.match(map, /const center = latest;/);
  assert.match(resource, /if \(!cancelled\)/);
  assert.match(resource, /\[401, 403, 404\]\.includes\(failure\.status\)/);
  assert.match(api, /requireToken\(token\)/);
  assert.doesNotMatch(api, /(?:source=sms|sms-gateway|firebase\/firestore)/i);
  assert.doesNotMatch(list + detail, /(?:apiPost|apiPatch|apiDelete|fetch\(.+method:\s*["'](?:POST|PATCH|DELETE))/i);
});
