// Shared contract for the simplified safe-location catalogue. No Firebase access.
const SAFE_LOCATION_FIELDS = [
  "name",
  "address",
  "location",
  "type",
  "description",
];
const SAFE_LOCATION_TYPES = [
  "shelter",
  "school",
  "hospital",
  "community_center",
  "other",
];

function safeLocationError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function ensureFields(value, allowed, code, allowEmpty = false) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw safeLocationError(code, "Request must be an object");
  }
  const keys = Object.keys(value);
  if (
    (!allowEmpty && !keys.length) ||
    keys.some((key) => !allowed.includes(key))
  ) {
    throw safeLocationError(code, `Provide only ${allowed.join(", ")}`);
  }
}

function normalizeSafeLocationId(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().includes("/") ||
    [".", ".."].includes(value.trim()) ||
    /^__.*__$/.test(value.trim()) ||
    Buffer.byteLength(value.trim(), "utf8") > 1500
  ) {
    throw safeLocationError(
      "INVALID_SAFE_LOCATION_ID",
      "Invalid safe location ID",
    );
  }
  return value.trim();
}

function normalizeSafeLocationData(input) {
  const code = "INVALID_SAFE_LOCATION_DATA";
  ensureFields(input, SAFE_LOCATION_FIELDS, code);
  function text(value, name, max, optional = false) {
    if (optional && value == null) return null;
    if (typeof value !== "string")
      throw safeLocationError(
        code,
        `${name} must be a string${optional ? " or null" : ""}`,
      );
    const result = value.trim();
    if ((!optional && !result) || result.length > max) {
      throw safeLocationError(
        code,
        `${name} must ${optional ? "" : "not be blank and "}not exceed ${max} characters`,
      );
    }
    return result || null;
  }
  ensureFields(input.location, ["latitude", "longitude"], code);
  const { latitude, longitude } = input.location;
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw safeLocationError(
      code,
      "Location requires numeric latitude [-90,90] and longitude [-180,180]",
    );
  }
  if (!SAFE_LOCATION_TYPES.includes(input.type))
    throw safeLocationError(code, "Invalid safe location type");
  return {
    name: text(input.name, "name", 200),
    address: text(input.address, "address", 500),
    location: { latitude, longitude },
    type: input.type,
    description: text(input.description, "description", 2000, true),
  };
}

function normalizeSafeLocationQuery(query = {}, requireOrigin = false) {
  const code = "INVALID_SAFE_LOCATION_QUERY";
  ensureFields(query, ["latitude", "longitude"], code, true);
  if (
    query.latitude === undefined &&
    query.longitude === undefined &&
    !requireOrigin
  )
    return null;
  function coordinate(value, name, min, max) {
    const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
    if (
      (typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !decimal.test(value.trim()))
    ) {
      throw safeLocationError(
        code,
        `${name} must be a number between ${min} and ${max}`,
      );
    }
    const result = Number(value);
    if (!Number.isFinite(result) || result < min || result > max) {
      throw safeLocationError(
        code,
        `${name} must be a number between ${min} and ${max}`,
      );
    }
    return result;
  }
  return {
    latitude: coordinate(query.latitude, "latitude", -90, 90),
    longitude: coordinate(query.longitude, "longitude", -180, 180),
  };
}

function isSoftDeleted(data) {
  return data.isDeleted === true || data.deletedAt != null;
}

function isVisibleSafeLocation(data) {
  if (isSoftDeleted(data)) return false;
  // Do not silently publish old inactive/unknown records. No migration writes.
  return (
    data.schemaVersion === 2 || data.status == null || data.status === "active"
  );
}

function calculateDistanceKm(origin, destination) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = radians(destination.latitude - origin.latitude);
  const deltaLon = radians(destination.longitude - origin.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(destination.latitude)) *
      Math.sin(deltaLon / 2) ** 2;
  const clamped = Math.max(0, Math.min(1, a));
  return 6371 * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
}

function toClientSafeLocation(record, origin = null) {
  // Select the new fields before validation; legacy capacity/services stay private.
  const input = Object.fromEntries(
    SAFE_LOCATION_FIELDS.filter((field) => Object.hasOwn(record, field)).map(
      (field) => [field, record[field]],
    ),
  );
  const data = normalizeSafeLocationData(input);
  return {
    id: record.id,
    ...data,
    distanceKm: origin ? calculateDistanceKm(origin, data.location) : null,
  };
}

function isoTimestamp(value) {
  if (value == null) return null;
  const time =
    typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isFinite(time.getTime()) ? time.toISOString() : null;
}

module.exports = {
  SAFE_LOCATION_FIELDS,
  SAFE_LOCATION_TYPES,
  safeLocationError,
  ensureFields,
  normalizeSafeLocationId,
  normalizeSafeLocationData,
  normalizeSafeLocationQuery,
  isSoftDeleted,
  isVisibleSafeLocation,
  calculateDistanceKm,
  toClientSafeLocation,
  isoTimestamp,
};
