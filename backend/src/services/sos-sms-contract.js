const { createHmac, timingSafeEqual } = require("node:crypto");
const { normalizeSosInput, parseIsoDate, sosError, validDocumentId } = require("./sos-contract");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = () => sosError("INVALID_SOS_SMS", "SMS format or credential is invalid");
function secret() {
  const key = process.env.SOS_SMS_SIGNING_KEY;
  if (!key || Buffer.byteLength(key) < 32) throw sosError("SMS_NOT_CONFIGURED", "SMS is not configured", 503);
  return key;
}
function sign(value) { return createHmac("sha256", secret()).update(`FGSOS1:${value}`).digest("base64url"); }
function issueCredential(residentId, now = Date.now()) {
  if (!validDocumentId(residentId)) throw fail();
  const expires = Math.floor(now / 1000) + 7 * 86400;
  const value = `${Buffer.from(residentId).toString("base64url")}.${expires.toString(36)}`;
  return { credential: `${value}.${sign(value)}`, expiresAt: new Date(expires * 1000).toISOString() };
}
function verifyCredential(token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 2100) throw fail();
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[0-9a-z]+$/.test(parts[1])) throw fail();
  const value = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(value)); const supplied = Buffer.from(parts[2]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw fail();
  const expires = parseInt(parts[1], 36) * 1000;
  if (!Number.isSafeInteger(expires) || expires <= now) throw sosError("SMS_CREDENTIAL_EXPIRED", "SMS credential expired");
  const residentId = Buffer.from(parts[0], "base64url").toString("utf8");
  if (!validDocumentId(residentId) || Buffer.from(residentId).toString("base64url") !== parts[0]) throw fail();
  return residentId;
}
// ASCII wire format. App-generated base64url note cannot inject delimiters.
// FGSOS1|credential|UUID|lat,lng|ISO-capture-time|situations|people|water|note64
function parseSms(body, now = Date.now()) {
  if (typeof body !== "string" || body.length > 3000 || /[^\x20-\x7e]/.test(body)) throw fail();
  const p = body.split("|");
  if (p.length !== 9 || p[0] !== "FGSOS1" || !UUID.test(p[2])) throw fail();
  const residentId = verifyCredential(p[1], now);
  const coords = p[3].split(",");
  const numeric = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if (coords.length !== 2 || coords.some(x => !numeric.test(x)) || !/^[1-9]\d*$/.test(p[6])) throw fail();
  let capturedAt = null;
  if (p[4] !== "-") {
    const ms = parseIsoDate(p[4], "capturedAt", "INVALID_SOS_SMS");
    if (ms > now + 120000) throw fail();
    capturedAt = new Date(ms).toISOString();
  }
  if (!/^[A-Za-z0-9_-]*$/.test(p[8])) throw fail();
  const note = Buffer.from(p[8], "base64url").toString("utf8");
  if (Buffer.from(note).toString("base64url") !== p[8]) throw fail();
  const input = {
    location: { latitude: Number(coords[0]), longitude: Number(coords[1]) },
    situations: p[5].split(","), numberOfPeople: Number(p[6]), waterLevel: p[7],
    note: note || null, clientRequestId: p[2],
  };
  normalizeSosInput(residentId, input);
  return { residentId, input, capturedAt };
}
module.exports = { UUID, issueCredential, verifyCredential, parseSms };
