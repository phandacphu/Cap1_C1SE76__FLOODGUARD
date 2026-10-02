const WEATHER_API_URL =
  "https://api.open-meteo.com/v1/forecast";
const FLOOD_API_URL =
  "https://flood-api.open-meteo.com/v1/flood";

const REQUEST_TIMEOUT_MS = 10000;

const DATA_DISCLAIMER =
  "Forecast data is provided for informational purposes and is not an official emergency warning.";

function validateCoordinates(latitude, longitude) {
  const normalizedLatitude = Number(latitude);
  const normalizedLongitude = Number(longitude);

  if (
    !Number.isFinite(normalizedLatitude) ||
    normalizedLatitude < -90 ||
    normalizedLatitude > 90
  ) {
    throw new Error(
      "Latitude must be a number between -90 and 90",
    );
  }

  if (
    !Number.isFinite(normalizedLongitude) ||
    normalizedLongitude < -180 ||
    normalizedLongitude > 180
  ) {
    throw new Error(
      "Longitude must be a number between -180 and 180",
    );
  }

  return {
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
  };
}

async function fetchJson(
  url,
  fetchImplementation = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await fetchImplementation(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `External API returned status ${response.status}`,
      );
    }

    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("External API request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeWeatherData(data, coordinates) {
  const times = data.hourly?.time || [];
  const precipitationProbabilities =
    data.hourly?.precipitation_probability || [];
  const precipitationValues =
    data.hourly?.precipitation || [];
  const rainValues = data.hourly?.rain || [];

  const hourly = times.map((time, index) => ({
    time,
    precipitationProbability:
      precipitationProbabilities[index] ?? null,
    precipitation: precipitationValues[index] ?? null,
    rain: rainValues[index] ?? null,
  }));

  return {
    source: "Open-Meteo Weather API",
    requestedLocation: coordinates,
    resolvedLocation: {
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
    },
    current: {
      time: data.current?.time ?? null,
      precipitation: data.current?.precipitation ?? null,
      rain: data.current?.rain ?? null,
      weatherCode: data.current?.weather_code ?? null,
    },
    hourly,
    units: {
      current: data.current_units || {},
      hourly: data.hourly_units || {},
    },
    disclaimer: DATA_DISCLAIMER,
  };
}

function normalizeFloodData(data, coordinates) {
  const times = data.daily?.time || [];
  const dischargeValues =
    data.daily?.river_discharge || [];
  const maximumDischargeValues =
    data.daily?.river_discharge_max || [];

  const daily = times.map((time, index) => ({
    date: time,
    riverDischarge: dischargeValues[index] ?? null,
    riverDischargeMax:
      maximumDischargeValues[index] ?? null,
  }));

  const dataAvailable = daily.some(
    (item) =>
      item.riverDischarge !== null ||
      item.riverDischargeMax !== null,
  );

  return {
    source: "Open-Meteo Flood API / GloFAS",
    requestedLocation: coordinates,
    resolvedLocation: {
      latitude: data.latitude,
      longitude: data.longitude,
    },
    dataAvailable,
    message: dataAvailable
      ? null
      : "No modeled river discharge data is available near this location",
    daily,
    units: data.daily_units || {},
    disclaimer: DATA_DISCLAIMER,
  };
}

async function getWeatherForecast(
  latitude,
  longitude,
  options = {},
) {
  const coordinates = validateCoordinates(
    latitude,
    longitude,
  );

  const query = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    current: "precipitation,rain,weather_code",
    hourly:
      "precipitation_probability,precipitation,rain",
    forecast_days: "3",
    timezone: "auto",
  });

  const data = await fetchJson(
    `${WEATHER_API_URL}?${query.toString()}`,
    options.fetchImplementation,
    options.timeoutMs,
  );

  return normalizeWeatherData(data, coordinates);
}

async function getFloodForecast(
  latitude,
  longitude,
  options = {},
) {
  const coordinates = validateCoordinates(
    latitude,
    longitude,
  );

  const query = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    daily: "river_discharge,river_discharge_max",
    forecast_days: "7",
  });

  const data = await fetchJson(
    `${FLOOD_API_URL}?${query.toString()}`,
    options.fetchImplementation,
    options.timeoutMs,
  );

  return normalizeFloodData(data, coordinates);
}

async function getWeatherAndFloodForecast(
  latitude,
  longitude,
  options = {},
) {
  const [weather, flood] = await Promise.all([
    getWeatherForecast(latitude, longitude, options),
    getFloodForecast(latitude, longitude, options),
  ]);

  return {
    weather,
    flood,
  };
}

module.exports = {
  WEATHER_API_URL,
  FLOOD_API_URL,
  DATA_DISCLAIMER,
  validateCoordinates,
  fetchJson,
  normalizeWeatherData,
  normalizeFloodData,
  getWeatherForecast,
  getFloodForecast,
  getWeatherAndFloodForecast,
};