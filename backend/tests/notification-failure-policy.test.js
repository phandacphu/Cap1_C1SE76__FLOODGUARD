const assert = require("node:assert/strict");

const {
  classifyNotificationDeliveryError: classify,
} = require("../src/services/notification-failure-policy.service");

let passed = 0;

function check(name, input, expected) {
  const result = classify(input);

  assert.deepEqual(result, expected);
  assert.equal(JSON.stringify(result).includes("SECRET_DO_NOT_LOG"), false);

  passed++;
  console.log(`PASS ${passed}: ${name}`);
}

function expected(failureType, providerResponseCode) {
  return {
    failureType,
    retryable: failureType === "transient",
    outcomeUnknown: failureType === "unknown",
    providerResponseCode,
  };
}

check(
  "429 can retry",
  { statusCode: 429, message: "SECRET_DO_NOT_LOG" },
  expected("transient", "PROVIDER_RATE_LIMITED"),
);

check(
  "500 can retry",
  { status: 500 },
  expected("transient", "PROVIDER_SERVER_ERROR"),
);

check(
  "503 can retry",
  { response: { status: 503, body: "SECRET_DO_NOT_LOG" } },
  expected("transient", "PROVIDER_SERVER_ERROR"),
);

check(
  "Invalid device token is permanent",
  { code: "INVALID_DEVICE_TOKEN", token: "SECRET_DO_NOT_LOG" },
  expected("permanent", "PROVIDER_INVALID_TOKEN"),
);

for (const statusCode of [400, 401, 403, 404, 410, 422]) {
  check(
    `${statusCode} is permanent`,
    { statusCode },
    expected("permanent", "PROVIDER_REJECTED"),
  );
}

for (const statusCode of [408, 504]) {
  check(
    `${statusCode} has unknown outcome`,
    { statusCode },
    expected("unknown", "NOTIFICATION_OUTCOME_UNKNOWN"),
  );
}

for (const code of ["ETIMEDOUT", "ECONNRESET", "EPIPE", "ABORT_ERR"]) {
  check(
    `${code} blocks automatic resend`,
    { code },
    expected("unknown", "NOTIFICATION_OUTCOME_UNKNOWN"),
  );
}

check(
  "Ordinary provider rejection preserves existing behavior",
  new Error("SECRET_DO_NOT_LOG"),
  expected("transient", "NOTIFICATION_TRANSPORT_SEND_FAILED"),
);

check(
  "Unrecognized raw provider code is not copied",
  { code: "SECRET_DO_NOT_LOG" },
  expected("transient", "NOTIFICATION_TRANSPORT_SEND_FAILED"),
);

check(
  "String HTTP status is not treated as a trusted numeric status",
  { statusCode: "400" },
  expected("transient", "NOTIFICATION_TRANSPORT_SEND_FAILED"),
);

console.log(`All ${passed} failure policy tests passed`);
