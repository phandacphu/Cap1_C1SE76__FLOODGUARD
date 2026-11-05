const { createOpenMeteoClient, fetchJson } = require("./open-meteo-client");
const forecastClient = createOpenMeteoClient();

const WEATHER_API_URL =
  "https://api.open-meteo.com/v1/forecast";
const FLOOD_API_URL =
  "https://flood-api.open-meteo.com/v1/flood";

const DATA_DISCLAIMER =
  "Forecast data is provided for informational purposes and is not an official emergency warning.";

function validateCoordinates(latitude, longitude) {
  const normalizedLatitude = Number(latitude);
  const normalizedLongitude = Number(longitude);

  if (
    (typeof latitude !== "number" && typeof latitude !== "string") ||
    String(latitude).trim() === "" ||
    !Number.isFinite(normalizedLatitude) ||
    normalizedLatitude < -90 ||
    normalizedLatitude > 90
  ) {
    throw new Error(
      "Latitude must be a number between -90 and 90",
    );
  }

  if (
    (typeof longitude !== "number" && typeof longitude !== "string") ||
    String(longitude).trim() === "" ||
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

function validLocation(data) {
  return data && typeof data === "object" && !Array.isArray(data) &&
    typeof data.latitude === "number" && Number.isFinite(data.latitude) &&
    Math.abs(data.latitude) <= 90 &&
    typeof data.longitude === "number" && Number.isFinite(data.longitude) &&
    Math.abs(data.longitude) <= 180;
}

function validSeries(series, fields) {
  return series && Array.isArray(series.time) && series.time.length > 0 &&
    series.time.every((time) => typeof time === "string" && time.length > 0) &&
    fields.every((field) => Array.isArray(series[field]) &&
      series[field].length === series.time.length &&
      series[field].every((value) => value === null ||
        (typeof value === "number" && Number.isFinite(value))));
}

function validWeather(data) {
  return validLocation(data) && data.current &&
    typeof data.current.time === "string" && data.current.time.length > 0 &&
    ["precipitation", "rain", "weather_code"].every((field) =>
      data.current[field] === null ||
      (typeof data.current[field] === "number" && Number.isFinite(data.current[field]))) &&
    validSeries(data.hourly, ["precipitation_probability", "precipitation", "rain"]);
}

function validFlood(data) {
  return validLocation(data) && validSeries(data.daily, ["river_discharge", "river_discharge_max"]);
}

function clientFor(options) {
  if (options.client) return options.client;
  // Preserve the existing injectable fetch/timeout interface without sharing mocks
  // with the production singleton or with other tests.
  if (options.fetchImplementation || options.timeoutMs !== undefined) {
    return createOpenMeteoClient({
      fetchImplementation: options.fetchImplementation,
      timeoutMs: options.timeoutMs,
      logger: options.logger ?? console,
    });
  }
  return forecastClient;
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

  const data = await clientFor(options).getJson(
    `${WEATHER_API_URL}?${query.toString()}`,
    "weather",
    validWeather,
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

  const data = await clientFor(options).getJson(
    `${FLOOD_API_URL}?${query.toString()}`,
    "flood",
    validFlood,
  );

  return normalizeFloodData(data, coordinates);
}

async function getWeatherAndFloodForecast(
  latitude,
  longitude,
  options = {},
) {
  // Validate once before starting either external request.
  validateCoordinates(latitude, longitude);
  const sharedOptions = { ...options, client: clientFor(options) };
  const results = await Promise.allSettled([
    getWeatherForecast(latitude, longitude, sharedOptions),
    getFloodForecast(latitude, longitude, sharedOptions),
  ]);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    const error = failures[0].reason;
    error.sources = results.map((result, index) => ({
      source: index === 0 ? "weather" : "flood",
      status: result.status === "fulfilled" ? "available" : "error",
      ...(result.status === "rejected" ? {
        code: result.reason.code,
        upstreamStatus: result.reason.upstreamStatus ?? null,
        causeCode: result.reason.causeCode ?? null,
      } : {}),
    }));
    const retryAfter = Math.max(...failures.map((result) => result.reason.retryAfterSeconds ?? 0));
    if (retryAfter > 0) error.retryAfterSeconds = retryAfter;
    throw error;
  }
  return { weather: results[0].value, flood: results[1].value };
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
