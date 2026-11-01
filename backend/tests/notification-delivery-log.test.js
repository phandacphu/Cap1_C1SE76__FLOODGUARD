const assert = require("node:assert/strict");

const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    db: {
      collection(name) {
        assert.equal(name, "notification_delivery_logs");

        return {
          doc(id) {
            return { id };
          },
        };
      },
    },
  },
};

const {
  buildNotificationCorrelationId,
  buildNotificationDeliveryLogId,
  normalizeNotificationDeliveryLog,
  stageNotificationDeliveryLog,
} = require("../src/services/notification-delivery-log.service");

const sample = {
  notificationId: "notification_001",
  eventId: "sos_status:history_001",
  status: "queued",
  retryCount: 0,
  providerResponseCode: "LOCAL_QUEUED",
};

let passed = 0;

function check(name, callback) {
  callback();
  passed++;
  console.log(`PASS ${passed}: ${name}`);
}

check("Valid queued log contains only approved fields", () => {
  const result = normalizeNotificationDeliveryLog(sample);

  assert.deepEqual(
    Object.keys(result).sort(),
    [
      "correlationId",
      "eventId",
      "notificationId",
      "outcomeUnknown",
      "providerResponseCode",
      "retryCount",
      "status",
    ].sort(),
  );

  assert.equal(result.status, "queued");
  assert.equal(result.eventId, sample.eventId);
  assert.equal(result.outcomeUnknown, false);
});

check("Correlation ID remains stable across attempts", () => {
  const queued = normalizeNotificationDeliveryLog(sample);
  const sent = normalizeNotificationDeliveryLog({
    ...sample,
    status: "sent",
    retryCount: 1,
    providerResponseCode: "PROVIDER_ACCEPTED",
  });

  assert.equal(queued.correlationId, sent.correlationId);
  assert.notEqual(
    queued.correlationId,
    buildNotificationCorrelationId("notification_002"),
  );
});

check("Log ID is stable per notification and entry key", () => {
  const first = buildNotificationDeliveryLogId(sample.notificationId, "queued");

  assert.equal(
    first,
    buildNotificationDeliveryLogId(sample.notificationId, "queued"),
  );

  assert.notEqual(
    first,
    buildNotificationDeliveryLogId(sample.notificationId, "lease_001"),
  );

  assert.notEqual(
    first,
    buildNotificationDeliveryLogId("notification_002", "queued"),
  );
});

check("Legacy event ID is deterministic", () => {
  const input = { ...sample };
  delete input.eventId;

  const first = normalizeNotificationDeliveryLog(input);
  const second = normalizeNotificationDeliveryLog(input);

  assert.match(first.eventId, /^legacy:[a-f0-9]{64}$/);
  assert.equal(first.eventId, second.eventId);
});

check("Sensitive and unsupported fields are rejected", () => {
  for (const field of [
    "accessToken",
    "authorization",
    "payload",
    "body",
    "title",
    "providerMessage",
    "recipientId",
  ]) {
    assert.throws(
      () =>
        normalizeNotificationDeliveryLog({
          ...sample,
          [field]: "SECRET_DO_NOT_LOG",
        }),
      (error) => {
        assert.equal(error.message.includes("SECRET_DO_NOT_LOG"), false);
        return /Invalid notification delivery log input/.test(error.message);
      },
    );
  }
});

check("Raw provider response is rejected without disclosure", () => {
  assert.throws(
    () =>
      normalizeNotificationDeliveryLog({
        ...sample,
        status: "failed",
        providerResponseCode: "SECRET_PROVIDER_RESPONSE",
      }),
    (error) => {
      assert.equal(error.message.includes("SECRET_PROVIDER_RESPONSE"), false);
      return /Invalid notification log response code/.test(error.message);
    },
  );
});

check("Invalid IDs, event IDs and retry counts are rejected", () => {
  for (const notificationId of ["", ".", "..", "bad/id", "__reserved__"]) {
    assert.throws(
      () =>
        normalizeNotificationDeliveryLog({
          ...sample,
          notificationId,
        }),
      /Invalid notification log document ID/,
    );
  }

  for (const eventId of ["", " ", 123, "a".repeat(257)]) {
    assert.throws(
      () => normalizeNotificationDeliveryLog({ ...sample, eventId }),
      /Invalid notification log event ID/,
    );
  }

  for (const retryCount of [-1, 1.5, "1", NaN]) {
    assert.throws(
      () => normalizeNotificationDeliveryLog({ ...sample, retryCount }),
      /Invalid notification log retry count/,
    );
  }
});

check("Invalid status and mismatched codes are rejected", () => {
  assert.throws(
    () =>
      normalizeNotificationDeliveryLog({
        ...sample,
        status: "unknown",
      }),
    /Invalid notification log status/,
  );

  for (const [status, providerResponseCode] of [
    ["queued", "PROVIDER_ACCEPTED"],
    ["sent", "LOCAL_QUEUED"],
    ["failed", "PROVIDER_ACCEPTED"],
  ]) {
    assert.throws(
      () =>
        normalizeNotificationDeliveryLog({
          ...sample,
          status,
          providerResponseCode,
        }),
      /status and outcome do not match/,
    );
  }
});

check("Failure and unknown outcome are supported", () => {
  const failed = normalizeNotificationDeliveryLog({
    ...sample,
    status: "failed",
    retryCount: 1,
    providerResponseCode: "NOTIFICATION_TRANSPORT_SEND_FAILED",
  });
  assert.equal(failed.outcomeUnknown, false);

  const timeout = normalizeNotificationDeliveryLog({
    ...sample,
    status: "failed",
    retryCount: 1,
    providerResponseCode: "NOTIFICATION_TRANSPORT_TIMEOUT",
    outcomeUnknown: true,
  });
  assert.equal(timeout.outcomeUnknown, true);

  assert.throws(
    () =>
      normalizeNotificationDeliveryLog({
        ...sample,
        outcomeUnknown: true,
      }),
    /status and outcome do not match/,
  );
});

check("Staging writes one safe record through caller writer", () => {
  const writes = [];

  const result = stageNotificationDeliveryLog(
    {
      create(ref, data) {
        writes.push({ ref, data });
      },
    },
    sample,
    "queued",
  );

  assert.equal(writes.length, 1);
  assert.equal(writes[0].ref.id, result.logId);
  assert.equal(writes[0].data.correlationId, result.correlationId);
  assert.ok(writes[0].data.timestamp);
  assert.equal(writes[0].data.eventId, sample.eventId);

  assert.deepEqual(
    Object.keys(writes[0].data).sort(),
    [
      ...Object.keys(normalizeNotificationDeliveryLog(sample)),
      "timestamp",
    ].sort(),
  );
});

check("Invalid input does not stage a write", () => {
  let writes = 0;

  assert.throws(
    () =>
      stageNotificationDeliveryLog(
        {
          create() {
            writes++;
          },
        },
        { ...sample, payload: "SECRET_DO_NOT_LOG" },
        "queued",
      ),
    /Invalid notification delivery log input/,
  );

  assert.equal(writes, 0);
});

console.log(`All ${passed} notification delivery log tests passed`);
