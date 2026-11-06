const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createOpenMeteoClient, fetchJson, retryAfterMilliseconds } = require("../src/services/open-meteo-client");
const { getWeatherAndFloodForecast, getWeatherForecast, getFloodForecast } = require("../src/services/open-meteo.service");

const weather = () => ({
  latitude: 10.05, longitude: 105.75,
  current: { time: "2026-11-05T20:00", precipitation: 0, rain: 0, weather_code: 3 },
  hourly: { time: ["2026-11-05T20:00"], precipitation_probability: [30], precipitation: [1], rain: [1] },
});
const flood = (value = 86.9) => ({
  latitude: 10.025, longitude: 105.725,
  daily: { time: ["2026-11-05"], river_discharge: [value], river_discharge_max: [value] },
});
const response = (data, status = 200, retryAfter = null) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: () => retryAfter }, json: async () => data,
});
function setup(fetchImplementation, settings = {}) {
  let time = Date.parse("2026-11-05T13:00:00Z");
  const logs = [];
  const client = createOpenMeteoClient({
    fetchImplementation, now: () => time,
    logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    ...settings,
  });
  return { client, logs, advance: (duration) => { time += duration; } };
}
const chooseData = (url) => url.includes("flood-api.") ? flood() : weather();

test("20 concurrent requests and a repeat make only one request per source", async () => {
  let calls = 0;
  const { client, logs } = setup(async (url) => { calls++; return response(chooseData(url)); });
  const values = await Promise.all(Array.from({ length: 20 }, () => getWeatherAndFloodForecast(10.0452, 105.7469, { client })));
  assert.equal(calls, 2);
  assert.equal(values[0].flood.daily[0].riverDischarge, 86.9);
  assert.equal(logs.length, 2);
  await getWeatherAndFloodForecast("10.0452", "105.7469", { client });
  assert.equal(calls, 2);
});

test("cache expires at TTL; never serves expired data after upstream failure", async () => {
  let failing = false, calls = 0;
  const { client, advance } = setup(async () => { calls++; return response(weather(), failing ? 503 : 200); }, { cacheTtlMs: 1000 });
  await getWeatherForecast(10, 105, { client });
  advance(999);
  await getWeatherForecast(10, 105, { client });
  assert.equal(calls, 1);
  advance(1); failing = true;
  await assert.rejects(getWeatherForecast(10, 105, { client }), { upstreamStatus: 503 });
  assert.equal(calls, 2);
});

test("cache keys preserve exact requested coordinates", async () => {
  let calls = 0;
  const { client } = setup(async () => { calls++; return response(weather()); });
  await getWeatherForecast(10.00001, 105, { client });
  const result = await getWeatherForecast(10.00002, 105, { client });
  assert.equal(calls, 2);
  assert.equal(result.requestedLocation.latitude, 10.00002);
});

test("429 pauses weather across coordinates, retains flood, then recovers", async () => {
  let weatherCalls = 0, floodCalls = 0, limited = true;
  const { client, advance, logs } = setup(async (url) => {
    if (url.includes("flood-api.")) { floodCalls++; return response(flood()); }
    weatherCalls++;
    return response(weather(), limited ? 429 : 200, "120");
  });
  await assert.rejects(getWeatherAndFloodForecast(10, 105, { client }), (error) => {
    assert.equal(error.source, "weather");
    assert.equal(error.retryAfterSeconds, 120);
    assert.deepEqual(error.sources.map((source) => source.status), ["error", "available"]);
    return true;
  });
  advance(1000);
  await assert.rejects(getWeatherAndFloodForecast(10, 105, { client }), { cooldown: true, retryAfterSeconds: 119 });
  await assert.rejects(getWeatherForecast(11, 106, { client }), { cooldown: true });
  assert.equal(weatherCalls, 1); assert.equal(floodCalls, 1);
  assert.equal(logs.filter((entry) => entry[1].source === "weather").length, 1);
  advance(119000); limited = false;
  const result = await getWeatherAndFloodForecast(10, 105, { client });
  assert.equal(result.weather.current.rain, 0);
  assert.equal(weatherCalls, 2); assert.equal(floodCalls, 1);
});

test("flood failure is identified independently and healthy weather stays cached", async () => {
  let weatherCalls = 0, floodCalls = 0, failing = true;
  const { client } = setup(async (url) => {
    if (url.includes("flood-api.")) { floodCalls++; return response(flood(), failing ? 500 : 200); }
    weatherCalls++; return response(weather());
  });
  await assert.rejects(getWeatherAndFloodForecast(10, 105, { client }), (error) => {
    assert.equal(error.source, "flood"); assert.equal(error.upstreamStatus, 500);
    assert.deepEqual(error.sources.map((source) => source.status), ["available", "error"]);
    return true;
  });
  failing = false;
  await getWeatherAndFloodForecast(10, 105, { client });
  assert.equal(weatherCalls, 1); assert.equal(floodCalls, 2);
});

test("both source failures are captured, including fetch cause code", async () => {
  const { client, logs } = setup(async (url) => {
    if (url.includes("flood-api.")) throw new TypeError("fetch failed", { cause: Object.assign(new Error("internal details"), { code: "ECONNRESET" }) });
    return response({}, 429);
  });
  await assert.rejects(getWeatherAndFloodForecast(10, 105, { client }), (error) => {
    assert.equal(error.sources[1].causeCode, "ECONNRESET"); return true;
  });
  assert.equal(logs.length, 2);
  assert.equal(JSON.stringify(logs).includes("latitude"), false);
  assert.equal(JSON.stringify(logs).includes("internal details"), false);
});

test("Retry-After supports seconds, HTTP-date and safe fallback", () => {
  const now = Date.parse("2026-11-05T13:00:00Z");
  assert.equal(retryAfterMilliseconds("120", now), 120000);
  assert.equal(retryAfterMilliseconds("Thu, 05 Nov 2026 13:02:00 GMT", now), 120000);
  for (const invalid of [null, "", "bad", "0", "Thu, 05 Nov 2026 12:59:00 GMT"]) {
    assert.equal(retryAfterMilliseconds(invalid, now), 60000);
  }
});

test("valid cached weather can be used during a cooldown triggered by another location", async () => {
  let calls = 0;
  const { client } = setup(async () => response(weather(), ++calls === 1 ? 200 : 429));
  await getWeatherForecast(10, 105, { client });
  await assert.rejects(getWeatherForecast(11, 106, { client }), { upstreamStatus: 429 });
  await getWeatherForecast(10, 105, { client });
  assert.equal(calls, 2);
});

for (const [label, data] of [
  ["null", null], ["empty object", {}],
  ["non-array series", { ...weather(), hourly: { time: "bad" } }],
  ["non-numeric value", { ...weather(), hourly: { ...weather().hourly, rain: ["bad"] } }],
  ["mismatched series", { ...weather(), hourly: { ...weather().hourly, rain: [] } }],
  ["missing current", { ...weather(), current: undefined }],
]) {
  test(`invalid weather ${label} is rejected and not cached`, async () => {
    let calls = 0;
    const { client } = setup(async () => response(++calls === 1 ? data : weather()));
    await assert.rejects(getWeatherForecast(10, 105, { client }), { code: "FORECAST_UPSTREAM_DATA" });
    await getWeatherForecast(10, 105, { client });
    assert.equal(calls, 2);
  });
}

test("malformed JSON is an upstream data error", async () => {
  await assert.rejects(fetchJson("https://api.open-meteo.com", async () => ({ ok: true, json: async () => { throw new SyntaxError("bad JSON"); } })), { code: "FORECAST_UPSTREAM_DATA" });
});

test("river data with all null measurements remains unavailable, never zero", async () => {
  const { client } = setup(async () => response(flood(null)));
  const result = await getFloodForecast(10, 105, { client });
  assert.equal(result.dataAvailable, false);
  assert.equal(result.daily[0].riverDischarge, null);
});

test("invalid river response is not accepted as no-modeled-data success", async () => {
  const { client } = setup(async () => response({ ...flood(), daily: {} }));
  await assert.rejects(getFloodForecast(10, 105, { client }), { source: "flood", code: "FORECAST_UPSTREAM_DATA" });
});

test("abort timeout is classified and rejected, then retry can succeed", async () => {
  let calls = 0;
  const { client } = setup(async (_url, { signal }) => {
    if (++calls > 1) return response(weather());
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
  }, { timeoutMs: 5 });
  await assert.rejects(getWeatherForecast(10, 105, { client }), { code: "FORECAST_UPSTREAM_TIMEOUT" });
  await getWeatherForecast(10, 105, { client });
  assert.equal(calls, 2);
});

test("invalid coordinates start neither source", async () => {
  let calls = 0;
  const { client } = setup(async () => { calls++; return response(weather()); });
  for (const value of ["", " ", null, [], [10], true, NaN, Infinity, 91]) {
    await assert.rejects(getWeatherAndFloodForecast(value, 105, { client }), /Latitude/);
  }
  await assert.rejects(getWeatherAndFloodForecast(10, "", { client }), /Longitude/);
  assert.equal(calls, 0);
});

test("cache is bounded and evicts entries", async () => {
  let calls = 0;
  const { client } = setup(async () => { calls++; return response(weather()); }, { maxEntries: 2 });
  for (const lat of [10, 11, 12, 10]) await getWeatherForecast(lat, 105, { client });
  assert.equal(calls, 4);
});

test("in-flight work is bounded and released after completion", async () => {
  let release;
  const { client } = setup(() => new Promise((resolve) => { release = () => resolve(response(weather())); }), { maxInFlight: 1 });
  const first = getWeatherForecast(10, 105, { client });
  await Promise.resolve();
  await assert.rejects(getWeatherForecast(11, 105, { client }), { code: "FORECAST_BUSY" });
  release(); await first;
  const next = getWeatherForecast(11, 105, { client });
  await Promise.resolve(); release(); await next;
});

test("network failure while reading JSON keeps its network cause code", async () => {
  await assert.rejects(fetchJson("https://api.open-meteo.com", async () => ({
    ok: true,
    json: async () => { throw new TypeError("terminated", { cause: Object.assign(new Error("socket closed"), { code: "UND_ERR_SOCKET" }) }); },
  })), { code: "FORECAST_UPSTREAM_NETWORK", causeCode: "UND_ERR_SOCKET" });
});

test("timeout also covers reading the response body", async () => {
  await assert.rejects(fetchJson("https://api.open-meteo.com", async (_url, { signal }) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })),
  }), 5), { code: "FORECAST_UPSTREAM_TIMEOUT" });
});
