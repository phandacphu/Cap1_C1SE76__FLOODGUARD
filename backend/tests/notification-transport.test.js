
const assert = require("node:assert/strict");

const {
  TRANSPORT_NOT_CONFIGURED,
  TRANSPORT_SEND_FAILED,
  sendNotificationViaTransport,
} = require("../src/services/notification-transport.service");

const sample = {
  id: "notification_001",
  recipientId: "resident_001",
  type: "sos_status",
  title: "SOS updated",
  body: "Your SOS request has been received",
};

async function runTests() {
  // TEST 1: No provider configured.
  const notConfigured =
    await sendNotificationViaTransport(sample);

  assert.equal(notConfigured.attempted, false);
  assert.equal(notConfigured.accepted, false);
  assert.equal(
    notConfigured.code,
    TRANSPORT_NOT_CONFIGURED,
  );

  console.log("PASS 1: Provider not configured");

  // TEST 2: Mock provider accepts the message.
  let receivedNotification = null;

  const successProvider = {
    async send(notification) {
      receivedNotification = notification;
      return "mock_message_001";
    },
  };

  const success = await sendNotificationViaTransport(
    sample,
    successProvider,
  );

  assert.equal(success.attempted, true);
  assert.equal(success.accepted, true);
  assert.equal(
    success.providerMessageId,
    "mock_message_001",
  );
  assert.equal(receivedNotification.id, sample.id);

  console.log("PASS 2: Provider accepts notification");

  // TEST 3: Provider throws an error.
  const failingProvider = {
    async send() {
      throw new Error("SECRET_TOKEN_DO_NOT_EXPOSE");
    },
  };

  const failure = await sendNotificationViaTransport(
    sample,
    failingProvider,
  );

  assert.equal(failure.attempted, true);
  assert.equal(failure.accepted, false);
  assert.equal(failure.code, TRANSPORT_SEND_FAILED);
  assert.equal(
    JSON.stringify(failure).includes("SECRET_TOKEN"),
    false,
  );

  console.log("PASS 3: Provider failure is contained");

  // TEST 4: Invalid provider is rejected.
  await assert.rejects(
    sendNotificationViaTransport(sample, {}),
    /Invalid notification transport provider/,
  );

  console.log("PASS 4: Invalid provider");

  // TEST 5: Invalid notification is rejected.
  await assert.rejects(
    sendNotificationViaTransport({ id: "" }),
    /Invalid notification for transport/,
  );

  console.log("PASS 5: Invalid notification");

  // TEST 6: Provider without a message ID.
  const noMessageIdProvider = {
    async send() {
      return undefined;
    },
  };

  const noMessageId =
    await sendNotificationViaTransport(
      sample,
      noMessageIdProvider,
    );

  assert.equal(noMessageId.attempted, true);
  assert.equal(noMessageId.accepted, true);
  assert.equal(noMessageId.providerMessageId, null);

  console.log("PASS 6: Optional provider message ID");


  // TEST 7: A hung provider must not block forever.
  const hungProvider = {
    send() {
      // Simulate a provider that never responds.
      return new Promise(() => {});
    },
  };

  const resultOrWatchdog = await Promise.race([
    sendNotificationViaTransport(
      sample,
      hungProvider,
      { timeoutMs: 100 },
    ),

    new Promise((resolve) => {
      setTimeout(() => {
        resolve("WATCHDOG_TIMEOUT");
      }, 500);
    }),
  ]);

  assert.notEqual(
    resultOrWatchdog,
    "WATCHDOG_TIMEOUT",
    "Transport must stop waiting for a hung provider",
  );

  assert.equal(resultOrWatchdog.attempted, true);
  assert.equal(resultOrWatchdog.accepted, false);
  assert.equal(
    resultOrWatchdog.code,
    "NOTIFICATION_TRANSPORT_TIMEOUT",
  );

  console.log("PASS 7: Hung provider timeout");


  console.log("All 6 Notification Transport tests passed");
}

runTests().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
