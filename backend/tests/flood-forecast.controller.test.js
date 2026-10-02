const assert = require("assert");

const servicePath = require.resolve(
  "../src/services/open-meteo.service",
);

let serviceBehavior = "success";
let serviceCallCount = 0;

const successfulForecast = {
  weather: {
    source: "Open-Meteo Weather API",
    hourly: [
      {
        time: "2026-10-02T13:00",
        precipitationProbability: 80,
        precipitation: 1.2,
        rain: 1.2,
      },
    ],
  },
  flood: {
    source: "Open-Meteo Flood API / GloFAS",
    dataAvailable: true,
    message: null,
    daily: [
      {
        date: "2026-10-02",
        riverDischarge: 86.9,
        riverDischargeMax: 89.16,
      },
    ],
  },
};

require.cache[servicePath] = {
  id: servicePath,
  filename: servicePath,
  loaded: true,
  exports: {
    async getWeatherAndFloodForecast(
      latitude,
      longitude,
    ) {
      serviceCallCount += 1;

      if (serviceBehavior === "validation") {
        throw new Error(
          "Latitude must be a number between -90 and 90",
        );
      }

      if (serviceBehavior === "unavailable") {
        throw new Error(
          "External API returned status 503",
        );
      }

      if (serviceBehavior === "timeout") {
        throw new Error(
          "External API request timed out",
        );
      }

      if (serviceBehavior === "internal") {
        throw new Error("Unexpected internal failure");
      }

      assert.strictEqual(latitude, "10.0452");
      assert.strictEqual(longitude, "105.7469");

      return successfulForecast;
    },
  },
};

const {
  getFloodForecast,
} = require(
  "../src/controllers/flood-forecast.controller",
);

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function runTests() {
  serviceBehavior = "success";
  serviceCallCount = 0;

  const missingCoordinatesResponse =
    createResponse();

  await getFloodForecast(
    {
      query: {},
    },
    missingCoordinatesResponse,
  );

  assert.strictEqual(
    missingCoordinatesResponse.statusCode,
    400,
  );
  assert.strictEqual(
    missingCoordinatesResponse.body.success,
    false,
  );
  assert.strictEqual(
    missingCoordinatesResponse.body.message,
    "Latitude and longitude query parameters are required",
  );
  assert.strictEqual(serviceCallCount, 0);

  const successResponse = createResponse();

  await getFloodForecast(
    {
      query: {
        latitude: "10.0452",
        longitude: "105.7469",
      },
    },
    successResponse,
  );

  assert.strictEqual(successResponse.statusCode, 200);
  assert.strictEqual(
    successResponse.body.success,
    true,
  );
  assert.strictEqual(
    successResponse.body.data.weather.source,
    "Open-Meteo Weather API",
  );
  assert.strictEqual(
    successResponse.body.data.flood.dataAvailable,
    true,
  );

  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    serviceBehavior = "validation";

    const validationResponse = createResponse();

    await getFloodForecast(
      {
        query: {
          latitude: "91",
          longitude: "108",
        },
      },
      validationResponse,
    );

    assert.strictEqual(
      validationResponse.statusCode,
      400,
    );
    assert.strictEqual(
      validationResponse.body.message,
      "Latitude must be a number between -90 and 90",
    );

    serviceBehavior = "unavailable";

    const unavailableResponse = createResponse();

    await getFloodForecast(
      {
        query: {
          latitude: "10",
          longitude: "105",
        },
      },
      unavailableResponse,
    );

    assert.strictEqual(
      unavailableResponse.statusCode,
      502,
    );
    assert.strictEqual(
      unavailableResponse.body.message,
      "External forecast service is unavailable",
    );

    serviceBehavior = "timeout";

    const timeoutResponse = createResponse();

    await getFloodForecast(
      {
        query: {
          latitude: "10",
          longitude: "105",
        },
      },
      timeoutResponse,
    );

    assert.strictEqual(
      timeoutResponse.statusCode,
      504,
    );
    assert.strictEqual(
      timeoutResponse.body.message,
      "External forecast service timed out",
    );

    serviceBehavior = "internal";

    const internalResponse = createResponse();

    await getFloodForecast(
      {
        query: {
          latitude: "10",
          longitude: "105",
        },
      },
      internalResponse,
    );

    assert.strictEqual(
      internalResponse.statusCode,
      500,
    );
    assert.strictEqual(
      internalResponse.body.message,
      "Internal server error",
    );
  } finally {
    console.error = originalConsoleError;
  }

  console.log(
    "Flood forecast controller tests passed",
  );
}

runTests().catch((error) => {
  console.error(
    "Flood forecast controller tests failed",
  );
  console.error(error);
  process.exit(1);
});