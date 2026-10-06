const assert = require("assert");

const {
  createRescueRequest,
  setRescueRequestById,
  getRescueRequestById,
  normalizeRescueRequestData,
} = require("../src/services/rescue-request.service");

const SAMPLE_RESCUE_REQUEST_ID =
  "ccf73-sample-rescue-request-01";

function createValidRescueRequestData() {
  return {
    residentId: "ccf73-sample-resident-01",
    location: {
      latitude: 16.0544,
      longitude: 108.2022,
    },
    urgency: "high",
    numberOfPeople: 3,
    note: "Simulated SOS request for FLOODGUARD testing",
  };
}

async function testRescueRequestService() {
  try {
    assert.throws(
      () =>
        normalizeRescueRequestData({
          ...createValidRescueRequestData(),
          residentId: "",
        }),
      /Rescue request resident ID is required/,
    );

    assert.throws(
      () =>
        normalizeRescueRequestData({
          ...createValidRescueRequestData(),
          location: {
            latitude: 91,
            longitude: 108.2022,
          },
        }),
      /latitude must be between -90 and 90/,
    );

    assert.throws(
      () =>
        normalizeRescueRequestData({
          ...createValidRescueRequestData(),
          urgency: "unknown",
        }),
      /Invalid rescue request urgency/,
    );

    assert.throws(
      () =>
        normalizeRescueRequestData({
          ...createValidRescueRequestData(),
          numberOfPeople: 0,
        }),
      /numberOfPeople must be a positive integer/,
    );

    assert.throws(
      () =>
        normalizeRescueRequestData({
          ...createValidRescueRequestData(),
          note: 123,
        }),
      /Rescue request note must be a string or null/,
    );

    const savedRequest = await setRescueRequestById(
      SAMPLE_RESCUE_REQUEST_ID,
      createValidRescueRequestData(),
    );

    assert.strictEqual(
      savedRequest.id,
      SAMPLE_RESCUE_REQUEST_ID,
    );
    assert.strictEqual(
      savedRequest.residentId,
      "ccf73-sample-resident-01",
    );
    assert.strictEqual(savedRequest.urgency, "high");
    assert.strictEqual(savedRequest.numberOfPeople, 3);
    assert.strictEqual(savedRequest.status, "submitted");
    assert.strictEqual(
      savedRequest.location.latitude,
      16.0544,
    );
    assert.strictEqual(
      savedRequest.location.longitude,
      108.2022,
    );
    assert.ok(savedRequest.createdAt);
    assert.ok(savedRequest.updatedAt);

    const fetchedRequest = await getRescueRequestById(
      SAMPLE_RESCUE_REQUEST_ID,
    );

    assert.ok(fetchedRequest);
    assert.strictEqual(
      fetchedRequest.id,
      SAMPLE_RESCUE_REQUEST_ID,
    );
    assert.strictEqual(
      fetchedRequest.status,
      "submitted",
    );

    const createdRequest = await createRescueRequest(
      createValidRescueRequestData(),
    );

    assert.ok(createdRequest.id);
    assert.strictEqual(
      createdRequest.status,
      "submitted",
    );

    console.log("Rescue request service tests passed");
    console.log(
      `Sample rescue request ID: ${SAMPLE_RESCUE_REQUEST_ID}`,
    );

    process.exit(0);
  } catch (error) {
    console.error("Rescue request service tests failed");
    console.error(error);

    process.exit(1);
  }
}

testRescueRequestService();