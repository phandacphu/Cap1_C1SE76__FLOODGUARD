const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const routes = require("../src/routes/flood-forecast.routes");

test("HTTP route preserves the mobile contract and handles upstream recovery and 429", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const originalError = console.error;
  const logs = [];
  const counts = { weather: 0, flood: 0 };
  let mode = "ok";
  globalThis.fetch = async (url) => {
    const source = url.includes("flood-api.") ? "flood" : "weather";
    counts[source]++;
    if (source === "weather" && mode === "network") {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("private network details"), { code: "ECONNRESET" }) });
    }
    const data = source === "weather" ? {
      latitude: 10, longitude: 105,
      current: { time: "2026-11-05T20:00", precipitation: 0, rain: 0, weather_code: 3 },
      hourly: { time: ["2026-11-05T20:00"], precipitation_probability: [30], precipitation: [1], rain: [1] },
    } : {
      latitude: 10, longitude: 105,
      daily: { time: ["2026-11-05"], river_discharge: [86.9], river_discharge_max: [89] },
    };
    const status = source === "weather" && mode === "limited" ? 429 : 200;
    return { ok: status === 200, status, headers: { get: () => "120" }, json: async () => source === "weather" && mode === "malformed" ? {} : data };
  };
  console.info = (...args) => logs.push(args);
  console.error = (...args) => logs.push(args);
  const app = express();
  app.use("/api/flood-forecast", routes);
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/flood-forecast`;
  const request = async (latitude) => {
    const result = await originalFetch(`${baseUrl}?latitude=${latitude}&longitude=105`);
    return { status: result.status, headers: result.headers, body: await result.json() };
  };
  try {
    await t.test("200 contains both weather and discharge; repeat uses caches", async () => {
      const result = await request(10);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.flood.daily[0].riverDischarge, 86.9);
      assert.equal(result.body.data.weather.current.rain, 0);
      await request(10);
      assert.deepEqual(counts, { weather: 1, flood: 1 });
    });
    await t.test("malformed weather becomes 502 and recovers without refetching flood", async () => {
      mode = "malformed";
      const result = await request(11);
      assert.equal(result.status, 502);
      assert.deepEqual(result.body, { success: false, message: "External forecast service is unavailable" });
      const floodCalls = counts.flood;
      mode = "ok";
      assert.equal((await request(11)).status, 200);
      assert.equal(counts.flood, floodCalls);
    });
    await t.test("network failure is 502 and logs source/cause without leaking details", async () => {
      mode = "network";
      assert.equal((await request(12)).status, 502);
      assert.ok(logs.some((entry) => entry[1].causeCode === "ECONNRESET" && entry[1].source === "weather"));
      assert.equal(JSON.stringify(logs).includes("private network details"), false);
      mode = "ok";
      assert.equal((await request(12)).status, 200);
    });
    await t.test("429 supplies Retry-After; retries do not call the blocked source", async () => {
      mode = "limited";
      const result = await request(13);
      assert.equal(result.status, 502);
      assert.equal(result.headers.get("retry-after"), "120");
      const before = { ...counts };
      const repeat = await request(13);
      assert.equal(repeat.status, 502);
      assert.ok(Number(repeat.headers.get("retry-after")) > 0);
      assert.deepEqual(counts, before);
      await request(14);
      assert.equal(counts.weather, before.weather);
      assert.equal(counts.flood, before.flood + 1);
      const combinedLog = logs.find((entry) => entry[0] === "Get flood forecast error:" && entry[1].upstreamStatus === 429);
      assert.deepEqual(combinedLog[1].sources.map((source) => source.status), ["error", "available"]);
    });
    await t.test("bad query returns 400 without upstream calls", async () => {
      const before = { ...counts };
      assert.equal((await request(91)).status, 400);
      assert.equal((await originalFetch(baseUrl)).status, 400);
      assert.deepEqual(counts, before);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    console.error = originalError;
  }
});
