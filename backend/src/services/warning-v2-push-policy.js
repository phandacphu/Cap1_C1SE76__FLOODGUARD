const { documentId } = require("./flood-warning-v2-contract");

function pushConfiguration(env = process.env) {
  if (env.FLOOD_WARNING_V2_PUSH_ENABLED !== "true") return { enabled: false };
  const mode = env.FLOOD_WARNING_V2_PUSH_MODE;
  if (!["test", "live"].includes(mode)) throw new Error("Warning V2 push requires explicit test/live mode");
  const recipients = new Set((env.FLOOD_WARNING_V2_TEST_RECIPIENT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean));
  for (const id of recipients) documentId(id);
  if (mode === "test" && !recipients.size) throw new Error("Warning V2 test mode requires recipient allowlist");
  if (mode === "live" && recipients.size) throw new Error("Remove test allowlist before enabling live broadcast");
  if (env.FIRESTORE_EMULATOR_HOST) throw new Error("Real FCM is disabled with Firestore Emulator");
  return { enabled: true, mode, allows: (id) => mode === "live" || recipients.has(id) };
}

function classifyPushError(error) {
  const code = error?.code;
  if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code)) {
    return { status: "failed", code: "INVALID_TOKEN", invalidToken: true };
  }
  if (["messaging/message-rate-exceeded", "messaging/device-message-rate-exceeded", "messaging/topics-message-rate-exceeded",
    "messaging/server-unavailable", "messaging/quota-exceeded"].includes(code)) {
    const headers = error?.httpResponse?.headers || error?.response?.headers;
    const raw = typeof headers?.get === "function" ? headers.get("retry-after") : headers?.["retry-after"];
    const seconds = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
    const date = typeof raw === "string" && !Number.isFinite(seconds) ? Date.parse(raw) : NaN;
    const delay = Number.isFinite(seconds) ? seconds * 1000 : date - Date.now();
    return { status: "retry", code: "PROVIDER_RETRYABLE",
      ...(Number.isSafeInteger(delay) && delay > 0 ? { retryAfterMs: delay } : {}) };
  }
  if (["messaging/invalid-argument", "messaging/invalid-payload", "messaging/payload-size-limit-exceeded",
    "messaging/invalid-data-payload-key", "messaging/invalid-options", "messaging/mismatched-credential",
    "messaging/authentication-error", "messaging/invalid-recipient", "messaging/invalid-package-name"].includes(code)) {
    return { status: "failed", code: "PROVIDER_REJECTED" };
  }
  // A generic SDK/network error is not proof that FCM rejected the message.
  return { status: "unknown", code: "PROVIDER_OUTCOME_UNKNOWN" };
}

function shorten(value, maximum) {
  const text = String(value ?? "");
  if (Buffer.byteLength(text, "utf8") <= maximum) return text;
  let result = "";
  for (const char of text) {
    if (Buffer.byteLength(result + char, "utf8") > maximum - 3) return result + "…";
    result += char;
  }
  return result + "…";
}
function pushMessage(job, target, token) {
  const createdAt = job.createdAt?.toDate().toISOString();
  if (!createdAt || !["general", "near", "inside", "deactivated"].includes(job.kind)) throw new Error("Invalid push job");
  const data = { schemaVersion: "2", eventId: job.eventId, alertId: job.alertId, kind: job.kind,
    title: job.kind === "deactivated" ? "" : shorten(job.payload?.title, 600),
    body: job.kind === "deactivated" ? "" : shorten(job.payload?.body, 2000), createdAt,
    installationId: target.installationId, bindingId: target.bindingId };
  // Budget includes keys/values, JSON and room for SDK envelope; content remains complete in GET detail.
  if (Buffer.byteLength(JSON.stringify(data), "utf8") > 3500 || Object.values(data).some((v) => typeof v !== "string")) {
    throw new Error("Invalid push payload budget");
  }
  // Data-only: Android must authenticate/reconcile before displaying. No auto-visible notification.
  const ttl = ["near", "inside"].includes(job.kind) ? 0 : 3600000;
  return { token, data, android: { priority: "high", ttl } };
}

async function sendPush(provider, message, timeoutMs = 10000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.send(message)).then((id) => {
        if (typeof id !== "string" || !id) return { status: "unknown", code: "INVALID_PROVIDER_RESULT" };
        return { status: "accepted", code: "PROVIDER_ACCEPTED" };
      }).catch(classifyPushError),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ status: "unknown", code: "PROVIDER_TIMEOUT" }), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
module.exports = { pushConfiguration, classifyPushError, pushMessage, sendPush };
