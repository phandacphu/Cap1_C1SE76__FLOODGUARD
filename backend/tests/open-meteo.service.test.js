const assert = require("assert");
const {
  validateCoordinates,
  getWeatherForecast,
  getFloodForecast,
  getWeatherAndFloodForecast,
} = require("../src/services/open-meteo.service");

function createJsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
  };
}

const weatherApiData = {
  latitude: 16.05,
  longitude: 108.2,
  timezone: "Asia/Bangkok",
  current_units: {
    precipitation: "mm",
    rain: "mm",
    weather_code: "wmo code",
  },
  current: {
    time: "2026-10-02T13:00",
    precipitation: 1.2,
    rain: 1.2,
    weather_code: 61,
  },
  hourly_units: {
    precipitation_probability: "%",
    precipitation: "mm",
    rain: "mm",
  },
  hourly: {
    time: [
      "2026-10-02T13:00",
      "2026-10-02T14:00",
    ],
    precipitation_probability: [80, 60],
    precipitation: [1.2, 0.5],
    rain: [1.2, 0.5],
  },
};

const floodApiData = {
  latitude: 10.025002,
  longitude: 105.725006,
  daily_units: {
    river_discharge: "m³/s",
    river_discharge_max: "m³/s",
  },
  daily: {
    time: ["2026-10-02", "2026-10-03"],
    river_discharge: [86.9, 83.33],
    river_discharge_max: [89.16, 88.13],
  },
};

const emptyFloodApiData = {
  latitude: 16.025002,
  longitude: 108.225006,
  daily_units: {
    river_discharge: "m³/s",
    river_discharge_max: "m³/s",
  },
  daily: {
    time: ["2026-10-02"],
    river_discharge: [null],
    river_discharge_max: [null],
  },
};

async function runTests() {
  const coordinates = validateCoordinates(
    "16.0544",
    "108.2022",
  );

  assert.deepStrictEqual(coordinates, {
    latitude: 16.0544,
    longitude: 108.2022,
  });

  assert.throws(
    () => validateCoordinates(91, 108),
    /Latitude must be a number between -90 and 90/,
  );

  assert.throws(
    () => validateCoordinates(16, 181),
    /Longitude must be a number between -180 and 180/,
  );

  const weather = await getWeatherForecast(
    16.0544,
    108.2022,
    {
      fetchImplementation: async (url) => {
        assert.ok(
          url.startsWith(
            "https://api.open-meteo.com/v1/forecast?",
          ),
        );
        assert.ok(url.includes("latitude=16.0544"));
        assert.ok(url.includes("longitude=108.2022"));

        return createJsonResponse(weatherApiData);
      },
    },
  );

  assert.strictEqual(
    weather.source,
    "Open-Meteo Weather API",
  );
  assert.strictEqual(
    weather.current.precipitation,
    1.2,
  );
  assert.strictEqual(weather.hourly.length, 2);
  assert.strictEqual(
    weather.hourly[0].precipitationProbability,
    80,
  );

  const flood = await getFloodForecast(
    10.0452,
    105.7469,
    {
      fetchImplementation: async (url) => {
        assert.ok(
          url.startsWith(
            "https://flood-api.open-meteo.com/v1/flood?",
          ),
        );

        return createJsonResponse(floodApiData);
      },
    },
  );

  assert.strictEqual(flood.dataAvailable, true);
  assert.strictEqual(flood.message, null);
  assert.strictEqual(
    flood.daily[0].riverDischarge,
    86.9,
  );
  assert.strictEqual(
    flood.daily[0].riverDischargeMax,
    89.16,
  );

  const unavailableFlood = await getFloodForecast(
    16.0544,
    108.2022,
    {
      fetchImplementation: async () =>
        createJsonResponse(emptyFloodApiData),
    },
  );

  assert.strictEqual(
    unavailableFlood.dataAvailable,
    false,
  );
  assert.strictEqual(
    unavailableFlood.daily[0].riverDischarge,
    null,
  );
  assert.ok(unavailableFlood.message);

  const combined =
    await getWeatherAndFloodForecast(
      10.0452,
      105.7469,
      {
        fetchImplementation: async (url) => {
          if (
            url.startsWith(
              "https://api.open-meteo.com",
            )
          ) {
            return createJsonResponse(weatherApiData);
          }

          if (
            url.startsWith(
              "https://flood-api.open-meteo.com",
            )
          ) {
            return createJsonResponse(floodApiData);
          }

          throw new Error("Unexpected URL");
        },
      },
    );

  assert.strictEqual(
    combined.weather.source,
    "Open-Meteo Weather API",
  );
  assert.strictEqual(
    combined.flood.dataAvailable,
    true,
  );

  await assert.rejects(
    () =>
      getWeatherForecast(16, 108, {
        fetchImplementation: async () =>
          createJsonResponse({}, 503),
      }),
    /External API returned status 503/,
  );

  console.log("Open-Meteo service tests passed");
}

runTests().catch((error) => {
  console.error("Open-Meteo service tests failed");
  console.error(error);
  process.exit(1);
});