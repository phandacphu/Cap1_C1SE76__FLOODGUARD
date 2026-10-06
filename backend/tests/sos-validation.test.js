const assert = require("node:assert/strict");

let databaseCalls = 0;

// Prevent this test from connecting to real Firestore.
const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    db: {
      collection() {
        databaseCalls += 1;
        throw new Error("Unexpected database access");
      },
      batch() {
        databaseCalls += 1;
        throw new Error("Unexpected database access");
      },
    },
  },
};

const {
  normalizeRescueRequestData,
  createRescueRequest,
  setRescueRequestById,
} = require("../src/services/rescue-request.service");

const {
  createSosWithHistory,
} = require("../src/services/create-sos.service");

function validData() {
  return {
    residentId: "resident-test",
    location: {
      latitude: 16.0544,
      longitude: 108.2022,
    },
    urgency: "high",
    numberOfPeople: 3,
    note: "  Simulated SOS  ",
  };
}

async function runTests() {
  const invalidCases = [];

  function addCase(name, data) {
    invalidCases.push({ name, data });
  }

  for (const field of [
    "residentId",
    "location",
    "urgency",
    "numberOfPeople",
  ]) {
    const data = validData();
    delete data[field];
    addCase(`missing ${field}`, data);
  }

  for (const residentId of [null, "", "   ", 123, {}, []]) {
    addCase("invalid residentId", {
      ...validData(),
      residentId,
    });
  }

  for (const location of [null, {}, [], "16,108", 123, true]) {
    addCase("invalid location", {
      ...validData(),
      location,
    });
  }

  // Arrays must remain invalid even with coordinate properties.
  const arrayLocation = [];
  arrayLocation.latitude = 16.0544;
  arrayLocation.longitude = 108.2022;

  addCase("array with coordinate properties", {
    ...validData(),
    location: arrayLocation,
  });

  for (const field of ["latitude", "longitude"]) {
    for (const value of [
      undefined,
      null,
      "",
      "16",
      true,
      {},
      [],
      NaN,
      Infinity,
      -Infinity,
    ]) {
      addCase(`invalid ${field}: ${String(value)}`, {
        ...validData(),
        location: {
          ...validData().location,
          [field]: value,
        },
      });
    }
  }

  for (const latitude of [-90.001, 90.001]) {
    addCase("latitude outside bounds", {
      ...validData(),
      location: { latitude, longitude: 108.2022 },
    });
  }

  for (const longitude of [-180.001, 180.001]) {
    addCase("longitude outside bounds", {
      ...validData(),
      location: { latitude: 16.0544, longitude },
    });
  }

  for (const urgency of [
    null,
    "",
    "HIGH",
    "unknown",
    1,
    true,
    [],
    {},
  ]) {
    addCase("invalid urgency", {
      ...validData(),
      urgency,
    });
  }

  for (const numberOfPeople of [
    null,
    0,
    -1,
    1.5,
    "3",
    true,
    [],
    {},
    NaN,
    Infinity,
  ]) {
    addCase("invalid numberOfPeople", {
      ...validData(),
      numberOfPeople,
    });
  }

  for (const note of [123, true, [], {}]) {
    addCase("invalid note", {
      ...validData(),
      note,
    });
  }

  for (const { name, data } of invalidCases) {
    assert.throws(
      () => normalizeRescueRequestData(data),
      Error,
      name,
    );

    await assert.rejects(
      () => createRescueRequest(data),
      Error,
      name,
    );

    await assert.rejects(
      () => setRescueRequestById("validation-test", data),
      Error,
      name,
    );

    const { residentId, ...input } = data;

    await assert.rejects(
      () => createSosWithHistory(residentId, input),
      (error) => error.code === "INVALID_SOS_INPUT",
      name,
    );

    assert.equal(
      databaseCalls,
      0,
      `${name} must be rejected before database access`,
    );
  }

  // Valid coordinate boundaries, including zero.
  for (const latitude of [-90, 0, 90]) {
    for (const longitude of [-180, 0, 180]) {
      const result = normalizeRescueRequestData({
        ...validData(),
        location: { latitude, longitude },
      });

      assert.deepEqual(result.location, {
        latitude,
        longitude,
      });
    }
  }

  for (const urgency of ["low", "medium", "high", "critical"]) {
    const result = normalizeRescueRequestData({
      ...validData(),
      urgency,
      numberOfPeople: 1,
    });

    assert.equal(result.urgency, urgency);
    assert.equal(result.numberOfPeople, 1);
  }

  for (const note of [undefined, null, "", "   "]) {
    const result = normalizeRescueRequestData({
      ...validData(),
      note,
    });

    assert.equal(result.note, null);
  }

  const normalized = normalizeRescueRequestData({
    ...validData(),
    residentId: "  resident-test  ",
  });

  assert.equal(normalized.residentId, "resident-test");
  assert.equal(normalized.note, "Simulated SOS");
  assert.equal(databaseCalls, 0);

  console.log("SOS validation tests passed");
  console.log(`Invalid data cases checked: ${invalidCases.length}`);
}

runTests().catch((error) => {
  console.error("SOS validation tests failed");
  console.error(error);
  process.exitCode = 1;
});