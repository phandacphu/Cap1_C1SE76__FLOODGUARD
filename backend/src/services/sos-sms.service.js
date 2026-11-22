const { createHash } = require("node:crypto");
const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const { ensureFields, sosError } = require("./sos-contract");
const { UUID, parseSms, parseSmsIsoDate } = require("./sos-sms-contract");
const { createSosWithHistory } = require("./create-sos.service");
const digest = text => createHash("sha256").update(text).digest("hex");
async function receiveSms(input) {
  ensureFields(input, ["messageId", "senderPhone", "receivedAt", "body"], "INVALID_SMS_ENVELOPE");
  if (!UUID.test(input.messageId) || typeof input.senderPhone !== "string" ||
      !/^\+?[0-9]{8,15}$/.test(input.senderPhone) || typeof input.body !== "string" ||
      input.body.length > 3000 || !input.body.startsWith("FGSOS1"))
    throw sosError("INVALID_SMS_ENVELOPE", "Invalid SMS envelope");
  const time = parseSmsIsoDate(input.receivedAt, "receivedAt", "INVALID_SMS_ENVELOPE");
  if (time === null || time > Date.now() + 120000) throw sosError("INVALID_SMS_ENVELOPE", "Invalid receive time");
  const ref = db.collection("sos_sms_inbox").doc(digest(input.messageId));
  const fingerprint = digest(JSON.stringify([input.senderPhone, input.receivedAt, input.body]));
  const previous = await db.runTransaction(async tx => {
    const old = await tx.get(ref);
    if (old.exists) {
      if (old.data().fingerprint !== fingerprint) throw sosError("SMS_MESSAGE_CONFLICT", "Message ID reused with different content", 409);
      return old.data();
    }
    tx.create(ref, { ...input, fingerprint, state: "pending", createdAt: FieldValue.serverTimestamp() });
    return null;
  });
  if (previous && previous.state !== "pending") return publicResult(ref.id, previous);
  let result;
  try {
    const parsed = parseSms(input.body);
    const sos = await createSosWithHistory(parsed.residentId, parsed.input, {
      senderPhone: input.senderPhone, receivedAt: new Date(time).toISOString(), capturedAt: parsed.capturedAt,
    });
    result = { state: "created", requestId: sos.id, code: null };
  } catch (error) {
    // DB/availability failures must propagate: Gateway retains and retries.
    // Business failures remain visible in the private inbox, never silent drops.
    if (!error.statusCode || error.statusCode >= 500) throw error;
    result = { state: "needs_review", requestId: null, code: error.code };
  }
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (current.data().state !== "pending") return;
    tx.update(ref, { ...result, processedAt: FieldValue.serverTimestamp() });
  });
  return publicResult(ref.id, result);
}
function publicResult(inboxId, result) {
  return { inboxId, state: result.state, requestId: result.requestId ?? null, code: result.code ?? null };
}
module.exports = { receiveSms };
