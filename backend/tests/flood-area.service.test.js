const assert = require("assert");
const {
  setFloodAreaById,
  getFloodAreaById,
  normalizeFloodAreaData,
} = require("../src/services/flood-area.service");

const SAMPLE_AREA_ID = "ccf44-sample-flood-area-01";

async function testFloodAreaService() {
  try {
    assert.throws(
      () =>
        normalizeFloodAreaData({
          name: "",
          geometry: {
            type: "polygon",
            points: [],
          },
          severity: "high",
          status: "active",
          source: "FLOODGUARD sample data",
        }),
      /Flood area name is required/,
    );

    assert.throws(
      () =>
        normalizeFloodAreaData({
          name: "Invalid Geometry Area",
          geometry: {
            type: "polygon",
            points: [
              {
                latitude: 16.0544,
                longitude: 108.2022,
              },
            ],
          },
          severity: "high",
          status: "active",
          source: "FLOODGUARD sample data",
        }),
      /at least three points/,
    );

    assert.throws(
      () =>
        normalizeFloodAreaData({
          name: "Invalid Severity Area",
          geometry: {
            type: "polygon",
            points: [
              {
                latitude: 16.0544,
                longitude: 108.2022,
              },
              {
                latitude: 16.056,
                longitude: 108.206,
              },
              {
                latitude: 16.052,
                longitude: 108.208,
              },
            ],
          },
          severity: "unknown",
          status: "active",
          source: "FLOODGUARD sample data",
        }),
      /Invalid flood area severity/,
    );

    const savedArea = await setFloodAreaById(
      SAMPLE_AREA_ID,
      {
        name: "Sample Flood Area 01",
        description:
          "Simulated flood area for API and map testing",
        geometry: {
          type: "polygon",
          points: [
            {
              latitude: 16.0544,
              longitude: 108.2022,
            },
            {
              latitude: 16.056,
              longitude: 108.206,
            },
            {
              latitude: 16.052,
              longitude: 108.208,
            },
          ],
        },
        severity: "high",
        status: "active",
        source: "FLOODGUARD sample data",
      },
    );

    assert.strictEqual(savedArea.id, SAMPLE_AREA_ID);
    assert.strictEqual(
      savedArea.name,
      "Sample Flood Area 01",
    );
    assert.strictEqual(savedArea.severity, "high");
    assert.strictEqual(savedArea.status, "active");
    assert.strictEqual(savedArea.geometry.type, "polygon");
    assert.strictEqual(savedArea.geometry.points.length, 3);
    assert.ok(savedArea.createdAt);
    assert.ok(savedArea.updatedAt);

    const fetchedArea =
      await getFloodAreaById(SAMPLE_AREA_ID);

    assert.ok(fetchedArea);
    assert.strictEqual(fetchedArea.id, SAMPLE_AREA_ID);
    assert.strictEqual(
      fetchedArea.source,
      "FLOODGUARD sample data",
    );

    console.log(
      "Flood area service tests passed",
    );
    console.log(
      `Sample flood area ID: ${SAMPLE_AREA_ID}`,
    );

    process.exit(0);
  } catch (error) {
    console.error("Flood area service tests failed");
    console.error(error);

    process.exit(1);
  }
}

testFloodAreaService();