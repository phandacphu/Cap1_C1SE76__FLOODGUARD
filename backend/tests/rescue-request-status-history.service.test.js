const assert = require("assert");

const {
  setRescueRequestById,
} = require("../src/services/rescue-request.service");

const {
  createRescueRequestStatusHistory,
  setRescueRequestStatusHistoryById,
  getRescueRequestStatusHistoryById,
  normalizeRescueRequestStatusHistoryData,
} = require(
  "../src/services/rescue-request-status-history.service",
);

const SAMPLE_RESCUE_REQUEST_ID =
  "ccf73-sample-rescue-request-01";

const SAMPLE_RESIDENT_ID =
  "ccf73-sample-resident-01";

const SAMPLE_INITIAL_HISTORY_ID =
  "ccf74-sample-status-submitted";

const SAMPLE_RECEIVED_HISTORY_ID =
  "ccf74-sample-status-received";

function createValidRescueRequestData() {
  return {
    residentId: SAMPLE_RESIDENT_ID,
    location: {
      latitude: 16.0544,
      longitude: 108.2022,
    },
    urgency: "high",
    numberOfPeople: 3,
    note: "Simulated SOS request for FLOODGUARD testing",
  };
}

function createValidInitialHistoryData() {
  return {
    requestId: SAMPLE_RESCUE_REQUEST_ID,
    oldStatus: null,
    newStatus: "submitted",
    changedBy: SAMPLE_RESIDENT_ID,
    note: "SOS request submitted",
  };
}

async function testRescueRequestStatusHistoryService() {
  try {
    await setRescueRequestById(
      SAMPLE_RESCUE_REQUEST_ID,
      createValidRescueRequestData(),
    );

    assert.throws(
      () =>
        normalizeRescueRequestStatusHistoryData({
          ...createValidInitialHistoryData(),
          newStatus: "received",
        }),
      /Initial rescue request status must be submitted/,
    );

    assert.throws(
      () =>
        normalizeRescueRequestStatusHistoryData({
          ...createValidInitialHistoryData(),
          oldStatus: "submitted",
          newStatus: "submitted",
        }),
      /Rescue request status must change/,
    );

    assert.throws(
      () =>
        normalizeRescueRequestStatusHistoryData({
          ...createValidInitialHistoryData(),
          changedBy: "",
        }),
      /changedBy is required/,
    );

    await assert.rejects(
      () =>
        setRescueRequestStatusHistoryById(
          "ccf74-missing-request-history",
          {
            ...createValidInitialHistoryData(),
            requestId: "missing-rescue-request",
          },
        ),
      /Referenced rescue request does not exist/,
    );

    const submittedHistory =
      await setRescueRequestStatusHistoryById(
        SAMPLE_INITIAL_HISTORY_ID,
        createValidInitialHistoryData(),
      );

    assert.strictEqual(
      submittedHistory.id,
      SAMPLE_INITIAL_HISTORY_ID,
    );
    assert.strictEqual(
      submittedHistory.requestId,
      SAMPLE_RESCUE_REQUEST_ID,
    );
    assert.strictEqual(submittedHistory.oldStatus, null);
    assert.strictEqual(
      submittedHistory.newStatus,
      "submitted",
    );
    assert.strictEqual(
      submittedHistory.changedBy,
      SAMPLE_RESIDENT_ID,
    );
    assert.ok(submittedHistory.changedAt);

    const receivedHistory =
      await setRescueRequestStatusHistoryById(
        SAMPLE_RECEIVED_HISTORY_ID,
        {
          requestId: SAMPLE_RESCUE_REQUEST_ID,
          oldStatus: "submitted",
          newStatus: "received",
          changedBy: "ccf74-sample-rescue-staff-01",
          note: "Rescue team received the SOS request",
        },
      );

    assert.strictEqual(
      receivedHistory.oldStatus,
      "submitted",
    );
    assert.strictEqual(
      receivedHistory.newStatus,
      "received",
    );

    const fetchedHistory =
      await getRescueRequestStatusHistoryById(
        SAMPLE_RECEIVED_HISTORY_ID,
      );

    assert.ok(fetchedHistory);
    assert.strictEqual(
      fetchedHistory.id,
      SAMPLE_RECEIVED_HISTORY_ID,
    );
    assert.strictEqual(
      fetchedHistory.requestId,
      SAMPLE_RESCUE_REQUEST_ID,
    );

    const createdHistory =
      await createRescueRequestStatusHistory({
        requestId: SAMPLE_RESCUE_REQUEST_ID,
        oldStatus: "received",
        newStatus: "in_progress",
        changedBy: "ccf74-sample-rescue-staff-01",
        note: "Rescue team started processing",
      });

    assert.ok(createdHistory.id);
    assert.strictEqual(
      createdHistory.newStatus,
      "in_progress",
    );

    console.log(
      "Rescue request status history service tests passed",
    );
    console.log(
      `Sample rescue request ID: ${SAMPLE_RESCUE_REQUEST_ID}`,
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "Rescue request status history service tests failed",
    );
    console.error(error);

    process.exit(1);
  }
}

testRescueRequestStatusHistoryService();