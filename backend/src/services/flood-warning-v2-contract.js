const { createHash } = require("node:crypto");

function warningError(code, message, statusCode) {
  return Object.assign(new Error(message), { code, statusCode, isWarningV2Error: true });
}
function documentId(value, code = "INVALID_ALERT_DATA", status = 400) {
  if (typeof value !== "string" || !value.trim() || value.trim().includes("/") ||
      [".", ".."].includes(value.trim()) || /^__.*__$/.test(value.trim()) ||
      /[\u0000-\u001f\u007f]/.test(value) || Buffer.byteLength(value.trim(), "utf8") > 1500) {
    throw warningError(code, "Invalid document ID", status);
  }
  return value.trim();
}
function requestId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())) {
    throw warningError("INVALID_ALERT_DATA", "A UUID v4 Idempotency-Key is required", 400);
  }
  return value.trim().toLowerCase();
}
function fields(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.getPrototypeOf(body) !== Object.prototype ||
      Object.keys(body).some((key) => !allowed.includes(key))) {
    throw warningError("INVALID_ALERT_DATA", "Unsupported or invalid warning fields", 400);
  }
}
function text(value, name, maximum) {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > maximum) {
    throw warningError("INVALID_ALERT_DATA", `${name} must contain 1 to ${maximum} characters`, 400);
  }
  return value.trim();
}
function createBody(body) {
  fields(body, ["title", "content"]);
  return { title: text(body.title, "title", 180), content: text(body.content, "content", 4000) };
}
function patchBody(body) {
  fields(body, ["title", "content", "expectedRevision"]);
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1 ||
      (!Object.hasOwn(body, "title") && !Object.hasOwn(body, "content"))) {
    throw warningError("INVALID_ALERT_DATA", "Provide expectedRevision and title or content", 400);
  }
  const patch = {};
  if (Object.hasOwn(body, "title")) patch.title = text(body.title, "title", 180);
  if (Object.hasOwn(body, "content")) patch.content = text(body.content, "content", 4000);
  return { expectedRevision: body.expectedRevision, patch };
}
function emptyBody(body) { if (body !== undefined) fields(body, []); }
function filters(query = {}) {
  // Express query objects may have a null prototype. Arrays and nested values are invalid.
  if (!query || typeof query !== "object" || Array.isArray(query) ||
      Object.keys(query).some((key) => !["status", "q"].includes(key)) ||
      (query.status !== undefined && !["active", "inactive"].includes(query.status)) ||
      (query.q !== undefined && (typeof query.q !== "string" || [...query.q.trim()].length > 180))) {
    throw warningError("INVALID_ALERT_QUERY", "Only status=active|inactive and text q are supported", 400);
  }
  return { status: query.status, q: (query.q || "").trim().toLocaleLowerCase("vi") };
}
function noQuery(query = {}) {
  if (Object.keys(query).length) throw warningError("INVALID_ALERT_QUERY", "Query parameters are not supported", 400);
}
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function clientAlert(snapshot) {
  if (!snapshot.exists || snapshot.data().schemaVersion !== 2) {
    throw warningError("ALERT_NOT_FOUND", "Flood warning not found", 404);
  }
  const a = snapshot.data();
  const iso = (time) => {
    if (!time || typeof time.toDate !== "function") throw new Error("Invalid warning timestamp");
    return time.toDate().toISOString();
  };
  if (!["active", "inactive"].includes(a.status) || a.scope !== "all_published_zones" ||
      !Number.isSafeInteger(a.revision) || a.revision < 1 ||
      typeof a.title !== "string" || !a.title.trim() || typeof a.content !== "string" || !a.content.trim() ||
      (a.status === "active" && a.endAt !== null) || (a.status === "inactive" && !a.endAt)) {
    throw new Error("Invalid V2 warning data");
  }
  const result = { id: snapshot.id, schemaVersion: 2, title: a.title, content: a.content,
    status: a.status, scope: a.scope, startAt: iso(a.startAt), endAt: a.endAt === null ? null : iso(a.endAt),
    createdAt: iso(a.createdAt), updatedAt: iso(a.updatedAt), revision: a.revision };
  if (result.endAt && result.endAt < result.startAt) throw new Error("Invalid warning interval");
  return result;
}
module.exports = { warningError, documentId, requestId, createBody, patchBody, emptyBody, filters, noQuery, hash, clientAlert };
