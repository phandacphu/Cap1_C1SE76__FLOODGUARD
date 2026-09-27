const assert = require("assert");
const {
  setFloodAlertById,
  getFloodAlertById,
  normalizeFloodAlertData,
} = require("../src/services/flood-alert.service");
const {
  getFloodAreaById,
} = require("../src/services/flood-area.service");

const SAMPLE_AREA_ID = "ccf44-sample-flood-area-01";
const SAMPLE_ALERT_ID = "ccf45-sample-flood-alert-01";

function createValidAlertData() {
  const now = Date.now();

  return {
    title: "Sample High Flood Warning",
    content:
      "Simulated warning for API and map testing",
    severity: "high",
    status: "active",
    areaId: SAMPLE_AREA_ID,
    startAt: new Date(now - 60 * 60 * 1000),
    endAt: new Date(now + 24 * 60 * 60 * 1000),
  };
}

async function testFloodAlertService() {
  try {
    assert.throws(
      () =>
        normalizeFloodAlertData({
          ...createValidAlertData(),
          title: "",
        }),
      /Flood alert title is required/,
    );

    assert.throws(
      () =>
        normalizeFloodAlertData({
          ...createValidAlertData(),
          severity: "unknown",
        }),
      /Invalid flood alert severity/,
    );

    assert.throws(
      () => {
        const alertData = createValidAlertData();

        normalizeFloodAlertData({
          ...alertData,
          startAt: alertData.endAt,
          endAt: alertData.startAt,
        });
      },
      /startAt must be earlier than endAt/,
    );

    const sampleArea =
      await getFloodAreaById(SAMPLE_AREA_ID);

    assert.ok(
      sampleArea,
      `Required sample flood area ${SAMPLE_AREA_ID} was not found`,
    );

    await assert.rejects(
      () =>
        setFloodAlertById(
          "ccf45-invalid-area-reference",
          {
            ...createValidAlertData(),
            areaId: "missing-flood-area",
          },
        ),
      /Referenced flood area does not exist/,
    );

    const savedAlert = await setFloodAlertById(
      SAMPLE_ALERT_ID,
      createValidAlertData(),
    );

    assert.strictEqual(savedAlert.id, SAMPLE_ALERT_ID);
    assert.strictEqual(
      savedAlert.title,
      "Sample High Flood Warning",
    );
    assert.strictEqual(savedAlert.severity, "high");
    assert.strictEqual(savedAlert.status, "active");
    assert.strictEqual(
      savedAlert.areaId,
      SAMPLE_AREA_ID,
    );
    assert.ok(
      savedAlert.startAt.toMillis() <
        savedAlert.endAt.toMillis(),
    );
    assert.ok(savedAlert.createdAt);
    assert.ok(savedAlert.updatedAt);

    const fetchedAlert =
      await getFloodAlertById(SAMPLE_ALERT_ID);

    assert.ok(fetchedAlert);
    assert.strictEqual(
      fetchedAlert.id,
      SAMPLE_ALERT_ID,
    );
    assert.strictEqual(
      fetchedAlert.areaId,
      SAMPLE_AREA_ID,
    );

    console.log(
      "Flood alert service tests passed",
    );
    console.log(
      `Sample flood alert ID: ${SAMPLE_ALERT_ID}`,
    );

    process.exit(0);
  } catch (error) {
    console.error("Flood alert service tests failed");
    console.error(error);

    process.exit(1);
  }
}

testFloodAlertService();