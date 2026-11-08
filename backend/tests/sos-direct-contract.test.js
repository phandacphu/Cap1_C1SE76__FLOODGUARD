const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  normalizeSosInput,
  normalizeSosFilters,
  toClientSos,
  parseIsoDate,
} = require("../src/services/sos-contract");
const body = () => ({
  location: { latitude: 16, longitude: 108 },
  situations: ["trapped"],
  numberOfPeople: 1,
  waterLevel: "waist",
});

test("form accepts every current Mobile enum without requiring urgency", () => {
  for (const waterLevel of [
    "below_knee",
    "waist",
    "chest",
    "above_two_meters",
  ]) {
    const input = {
      ...body(),
      waterLevel,
      situations: ["trapped", "evacuation", "injured", "vulnerable", "other"],
    };
    assert.equal(normalizeSosInput("r", input).waterLevel, waterLevel);
  }
});

test("form rejects missing/invalid fields, obsolete input and caller-controlled identity/state", () => {
  const inputs = [];
  for (const field of [
    "location",
    "situations",
    "numberOfPeople",
    "waterLevel",
  ]) {
    const input = body();
    delete input[field];
    inputs.push(input);
  }
  for (const situations of [
    [],
    ["unknown"],
    ["trapped", "trapped"],
    "trapped",
    null,
  ])
    inputs.push({ ...body(), situations });
  for (const numberOfPeople of [
    0,
    -1,
    1.5,
    "2",
    true,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    inputs.push({ ...body(), numberOfPeople });
  for (const waterLevel of [null, "unknown", 1, []])
    inputs.push({ ...body(), waterLevel });
  for (const note of [123, [], {}, "x".repeat(201)])
    inputs.push({ ...body(), note });
  for (const field of [
    "urgency",
    "status",
    "residentId",
    "capturedAt",
    "id",
    "completedBy",
  ])
    inputs.push({ ...body(), [field]: "spoof" });
  for (const location of [
    [],
    null,
    { latitude: "16", longitude: 108 },
    { latitude: NaN, longitude: 108 },
    { latitude: 91, longitude: 108 },
    { latitude: 16, longitude: -181 },
    { latitude: 16, longitude: 108, extra: 1 },
  ])
    inputs.push({ ...body(), location });
  inputs.push(null, [], 2);
  for (const input of inputs)
    assert.throws(() => normalizeSosInput("r", input), {
      code: "INVALID_SOS_INPUT",
    });
  for (const id of ["", "../", ".", "__reserved__"])
    assert.throws(() => normalizeSosInput(id, body()));
});

test("date filters reject normalized invalid dates and ambiguous timestamps", () => {
  for (const date of [
    "2026-02-30T00:00:00Z",
    "2026-11-08",
    "2026-11-08T00:00:00",
    "2026-11-08T24:00:00Z",
    [],
    null,
  ]) {
    assert.throws(() => parseIsoDate(date, "from"));
  }
  assert.equal(
    parseIsoDate("2024-02-29T07:00:00+07:00", "from"),
    Date.parse("2024-02-29T00:00:00Z"),
  );
});

test("read contract maps legacy states without inventing missing GPS or completion facts", () => {
  for (const status of ["submitted", "received", "in_progress"])
    assert.equal(toClientSos({ id: "old", status }).state, "active");
  assert.equal(toClientSos({ status: "assisted" }).state, "rescued");
  assert.equal(toClientSos({ status: "cancelled" }).state, "legacy_other");
  assert.equal(toClientSos({ status: "unexpected" }).state, "legacy_other");
  const value = toClientSos({
    location: { latitude: 1, longitude: 2 },
    urgency: "high",
  });
  for (const key of [
    "initialLocation",
    "locationCapturedAt",
    "locationReceivedAt",
    "completedBy",
    "completedAt",
    "situations",
    "waterLevel",
  ])
    assert.equal(value[key], null);
  assert.equal(Object.hasOwn(value, "urgency"), false);
});

test("new filter contract rejects priority, urgency, unknown parameters and conflicting filters", () => {
  for (const input of [
    { urgency: "high" },
    { severity: "high" },
    { sort: "priority" },
    { state: "active", status: "submitted" },
    { state: "unknown" },
    { status: [] },
    { from: "2026-11-09T00:00:00Z", to: "2026-11-08T00:00:00Z" },
    { page: "1" },
  ]) {
    assert.throws(() => normalizeSosFilters(input), {
      code: "INVALID_RESCUE_REQUEST_FILTER",
    });
  }
});
