const assert = require("assert");

const {
  setSafeLocationById,
  getSafeLocationById,
  setSafeLocationServiceById,
  getSafeLocationServiceById,
  normalizeSafeLocationData,
  normalizeSafeLocationServiceData,
} = require("../src/services/safe-location.service");

const SAMPLE_LOCATION_ID =
  "ccf66-sample-safe-location-01";

const SAMPLE_WATER_SERVICE_ID =
  "ccf66-sample-service-water";

const SAMPLE_FIRST_AID_SERVICE_ID =
  "ccf66-sample-service-first-aid";

function createValidSafeLocationData() {
  return {
    name: "Sample Community Shelter 01",
    address: "Hai Chau District, Da Nang",
    location: {
      latitude: 16.0544,
      longitude: 108.2022,
    },
    type: "community_center",
    capacity: 300,
    capacityNote:
      "Temporary capacity for prototype testing",
    description:
      "Simulated evacuation location for FLOODGUARD testing",
    contactPhone: "02361234567",
    status: "active",
  };
}

async function testSafeLocationService() {
  try {
    assert.throws(
      () =>
        normalizeSafeLocationData({
          ...createValidSafeLocationData(),
          name: "",
        }),
      /Safe location name is required/,
    );

    assert.throws(
      () =>
        normalizeSafeLocationData({
          ...createValidSafeLocationData(),
          location: {
            latitude: 91,
            longitude: 108.2022,
          },
        }),
      /latitude must be between -90 and 90/,
    );

    assert.throws(
      () =>
        normalizeSafeLocationData({
          ...createValidSafeLocationData(),
          capacity: -1,
        }),
      /capacity must be a non-negative integer/,
    );

    assert.throws(
      () =>
        normalizeSafeLocationData({
          ...createValidSafeLocationData(),
          type: "unknown",
        }),
      /Invalid safe location type/,
    );

    assert.throws(
      () =>
        normalizeSafeLocationServiceData({
          safeLocationId: SAMPLE_LOCATION_ID,
          name: "first_aid",
          isAvailable: "yes",
        }),
      /availability must be boolean/,
    );

    const savedLocation = await setSafeLocationById(
      SAMPLE_LOCATION_ID,
      createValidSafeLocationData(),
    );

    assert.strictEqual(
      savedLocation.id,
      SAMPLE_LOCATION_ID,
    );
    assert.strictEqual(
      savedLocation.name,
      "Sample Community Shelter 01",
    );
    assert.strictEqual(
      savedLocation.type,
      "community_center",
    );
    assert.strictEqual(savedLocation.capacity, 300);
    assert.strictEqual(savedLocation.status, "active");
    assert.ok(savedLocation.createdAt);
    assert.ok(savedLocation.updatedAt);

    const fetchedLocation = await getSafeLocationById(
      SAMPLE_LOCATION_ID,
    );

    assert.ok(fetchedLocation);
    assert.strictEqual(
      fetchedLocation.id,
      SAMPLE_LOCATION_ID,
    );
    assert.strictEqual(
      fetchedLocation.location.latitude,
      16.0544,
    );
    assert.strictEqual(
      fetchedLocation.location.longitude,
      108.2022,
    );

    await assert.rejects(
      () =>
        setSafeLocationServiceById(
          "ccf66-invalid-location-service",
          {
            safeLocationId: "missing-safe-location",
            name: "drinking_water",
            description: null,
            isAvailable: true,
          },
        ),
      /Referenced safe location does not exist/,
    );

    const waterService =
      await setSafeLocationServiceById(
        SAMPLE_WATER_SERVICE_ID,
        {
          safeLocationId: SAMPLE_LOCATION_ID,
          name: "drinking_water",
          description:
            "Sample drinking water support",
          isAvailable: true,
        },
      );

    assert.strictEqual(
      waterService.id,
      SAMPLE_WATER_SERVICE_ID,
    );
    assert.strictEqual(
      waterService.safeLocationId,
      SAMPLE_LOCATION_ID,
    );
    assert.strictEqual(
      waterService.name,
      "drinking_water",
    );
    assert.strictEqual(
      waterService.isAvailable,
      true,
    );
    assert.ok(waterService.createdAt);
    assert.ok(waterService.updatedAt);

    const firstAidService =
      await setSafeLocationServiceById(
        SAMPLE_FIRST_AID_SERVICE_ID,
        {
          safeLocationId: SAMPLE_LOCATION_ID,
          name: "first_aid",
          description:
            "Sample first-aid support",
          isAvailable: true,
        },
      );

    assert.strictEqual(
      firstAidService.safeLocationId,
      SAMPLE_LOCATION_ID,
    );
    assert.strictEqual(
      firstAidService.name,
      "first_aid",
    );

    const fetchedWaterService =
      await getSafeLocationServiceById(
        SAMPLE_WATER_SERVICE_ID,
      );

    assert.ok(fetchedWaterService);
    assert.strictEqual(
      fetchedWaterService.safeLocationId,
      SAMPLE_LOCATION_ID,
    );

    console.log("Safe location service tests passed");
    console.log(
      `Sample safe location ID: ${SAMPLE_LOCATION_ID}`,
    );

    process.exit(0);
  } catch (error) {
    console.error("Safe location service tests failed");
    console.error(error);

    process.exit(1);
  }
}

testSafeLocationService();