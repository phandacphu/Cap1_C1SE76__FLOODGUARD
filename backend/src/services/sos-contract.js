const { createHash } = require("node:crypto");

const ACTIVE_SOS_STATUSES = ["submitted", "received", "in_progress"];
const ACTIVE_SOS_COLLECTION = "active_sos_requests";
const SOS_SITUATIONS = [
  "trapped",
  "evacuation",
  "injured",
  "vulnerable",
  "other",
];
const SOS_WATER_LEVELS = ["below_knee", "waist", "chest", "above_two_meters"];

function sosError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function validDocumentId(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.trim().includes("/") &&
    ![".", ".."].includes(value.trim()) &&
    !/^__.*__$/.test(value.trim()) &&
    Buffer.byteLength(value.trim(), "utf8") <= 1500
  );
}

function activeSosLockId(residentId) {
  return createHash("sha256").update(residentId).digest("hex");
}

function ensureFields(input, allowed, code) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw sosError(code, "Request must be an object");
  }
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra !== undefined)
    throw sosError(code, `Unsupported request field: ${extra}`);
}

function normalizeSosLocation(location, code = "INVALID_SOS_INPUT") {
  ensureFields(location, ["latitude", "longitude"], code);
  if (
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    location.latitude < -90 ||
    location.latitude > 90 ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    throw sosError(
      code,
      "Location requires finite numeric latitude [-90,90] and longitude [-180,180]",
    );
  }
  return { latitude: location.latitude, longitude: location.longitude };
}

function normalizeSosInput(residentId, input) {
  const code = "INVALID_SOS_INPUT";
  if (!validDocumentId(residentId)) throw sosError(code, "Invalid resident ID");
  ensureFields(
    input,
    ["location", "situations", "numberOfPeople", "waterLevel", "note"],
    code,
  );
  if (
    !Array.isArray(input.situations) ||
    input.situations.length === 0 ||
    input.situations.length > SOS_SITUATIONS.length ||
    input.situations.some((value) => !SOS_SITUATIONS.includes(value)) ||
    new Set(input.situations).size !== input.situations.length
  ) {
    throw sosError(
      code,
      "situations requires unique supported values and at least one situation",
    );
  }
  if (!Number.isSafeInteger(input.numberOfPeople) || input.numberOfPeople < 1) {
    throw sosError(code, "numberOfPeople must be a positive safe integer");
  }
  if (!SOS_WATER_LEVELS.includes(input.waterLevel))
    throw sosError(code, "Invalid waterLevel");
  if (input.note != null && typeof input.note !== "string")
    throw sosError(code, "note must be a string or null");
  const note = input.note?.trim() || null;
  if (note && note.length > 200)
    throw sosError(code, "note must not exceed 200 characters");
  return {
    residentId: residentId.trim(),
    location: normalizeSosLocation(input.location),
    situations: [...input.situations],
    numberOfPeople: input.numberOfPeople,
    waterLevel: input.waterLevel,
    note,
  };
}

function sosState(status) {
  if (ACTIVE_SOS_STATUSES.includes(status)) return "active";
  if (status === "assisted") return "rescued";
  return "legacy_other";
}

function timestampMillis(value) {
  if (value == null) return NaN;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return typeof value === "string" ? Date.parse(value) : NaN;
}

function isoTimestamp(value) {
  const millis = timestampMillis(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

// A shared projection keeps Resident, Rescue and Admin on the same contract.
// Legacy missing facts stay null: no invented initial GPS or completion actor.
function toClientSos(request) {
  return {
    id: request.id,
    residentId: request.residentId,
    location: request.location ?? null,
    initialLocation: request.initialLocation ?? null,
    locationCapturedAt: isoTimestamp(request.locationCapturedAt),
    locationReceivedAt: isoTimestamp(request.locationReceivedAt),
    situations: request.situations ?? null,
    numberOfPeople: request.numberOfPeople ?? null,
    waterLevel: request.waterLevel ?? null,
    note: request.note ?? null,
    status: request.status,
    state: sosState(request.status),
    completedBy: request.completedBy ?? null,
    completedAt: isoTimestamp(request.completedAt),
    createdAt: isoTimestamp(request.createdAt),
    updatedAt: isoTimestamp(request.updatedAt),
  };
}

function parseIsoDate(value, field, code = "INVALID_RESCUE_REQUEST_FILTER") {
  if (value === undefined) return null;
  const match =
    typeof value === "string" &&
    value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/,
    );
  if (!match)
    throw sosError(code, `${field} must be an ISO datetime with timezone`);
  const [, y, m, d, h, min, s, , oh = "0", om = "0"] = match;
  const leap = +y % 4 === 0 && (+y % 100 !== 0 || +y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    +y < 1 ||
    +m < 1 ||
    +m > 12 ||
    +d < 1 ||
    +d > days[+m - 1] ||
    +h > 23 ||
    +min > 59 ||
    +s > 59 ||
    +oh > 23 ||
    +om > 59 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw sosError(code, `Invalid ${field} datetime`);
  }
  return Date.parse(value);
}

function normalizeSosFilters(filters = {}) {
  const code = "INVALID_RESCUE_REQUEST_FILTER";
  ensureFields(filters, ["status", "state", "sort", "from", "to"], code);
  const status = filters.status ?? null;
  const state = filters.state ?? null;
  const sort = filters.sort ?? "newest";
  if (
    status !== null &&
    ![...ACTIVE_SOS_STATUSES, "assisted", "cancelled"].includes(status)
  ) {
    throw sosError(code, "Invalid status filter");
  }
  if (
    state !== null &&
    !["active", "rescued", "legacy_other"].includes(state)
  ) {
    throw sosError(code, "Invalid state filter");
  }
  if (state && status)
    throw sosError(code, "Use either state or status, not both");
  if (!["newest", "oldest"].includes(sort))
    throw sosError(code, "Invalid sort filter");
  const from = parseIsoDate(filters.from, "from");
  const to = parseIsoDate(filters.to, "to");
  if (from !== null && to !== null && from > to)
    throw sosError(code, "from must not exceed to");
  return { status, state, sort, from, to };
}

function matchesSosFilters(request, filters) {
  if (filters.status && request.status !== filters.status) return false;
  if (filters.state && sosState(request.status) !== filters.state) return false;
  if (filters.from !== null || filters.to !== null) {
    const time = timestampMillis(request.createdAt);
    if (
      !Number.isFinite(time) ||
      (filters.from !== null && time < filters.from) ||
      (filters.to !== null && time > filters.to)
    )
      return false;
  }
  return true;
}

module.exports = {
  ACTIVE_SOS_STATUSES,
  ACTIVE_SOS_COLLECTION,
  SOS_SITUATIONS,
  SOS_WATER_LEVELS,
  sosError,
  validDocumentId,
  activeSosLockId,
  ensureFields,
  normalizeSosLocation,
  normalizeSosInput,
  sosState,
  timestampMillis,
  isoTimestamp,
  toClientSos,
  parseIsoDate,
  normalizeSosFilters,
  matchesSosFilters,
};
