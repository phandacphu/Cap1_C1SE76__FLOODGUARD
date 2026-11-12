"use strict";

const { normalizePoint } = require("./rescue-route-distance.service");
const MATRIX_URL = "https://api.heigit.org/openrouteservice/v2/matrix/driving-car";
const MAX_DESTINATIONS = 100;
const CACHE_TTL_MS = 120_000;
const RATE_WINDOW_MS = 60_000;

function serviceError(code, statusCode, message) {
  return Object.assign(new Error(message), { code, statusCode });
}

/** One driving-road matrix for a Rescue origin and at most 100 SOS locations. No Firestore writes. */
function createRescueRouteMatrixService({
  fetchImplementation = (...args) => globalThis.fetch(...args),
  apiKeyProvider = () => process.env.ORS_API_KEY,
  now = Date.now,
  timeoutMs = 8_000,
  userMinuteLimit = 5,
  processMinuteLimit = 20,
  processDayLimit = 400,
} = {}) {
  const cache = new Map();
  const inflight = new Map();
  const perUser = new Map();
  let processMinute = { since: 0, count: 0 };
  let processDay = { day: "", count: 0 };

  async function estimateBatch({ origin, destinations, rescueId }) {
    const from = normalizePoint(origin, "origin");
    if (!Array.isArray(destinations) || destinations.length > MAX_DESTINATIONS ||
        typeof rescueId !== "string" || !rescueId.trim()) {
      throw serviceError("INVALID_MATRIX_REQUEST", 400, "Invalid SOS list or Rescue session");
    }
    const seen = new Set();
    const rows = destinations.map((row) => {
      if (!row || typeof row.requestId !== "string" || !row.requestId.trim() ||
          seen.has(row.requestId)) {
        throw serviceError("INVALID_MATRIX_REQUEST", 400, "Duplicate or invalid SOS ID");
      }
      seen.add(row.requestId);
      return { requestId: row.requestId, destination: normalizePoint(row.destination, "destination") };
    });
    if (rows.length === 0) return { results: [], provider: "openrouteservice", travelMode: "DRIVE" };
    const apiKey = apiKeyProvider();
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      throw serviceError("ROUTES_NOT_CONFIGURED", 503, "Route distance is not configured");
    }
    // Coalesce jitter at the origin without reusing a distance for a moved SOS.
    const key = JSON.stringify([rescueId, from.latitude.toFixed(3), from.longitude.toFixed(3),
      rows.map((row) => [row.requestId, row.destination.latitude, row.destination.longitude])]);
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.value;
    if (hit) cache.delete(key);
    if (inflight.has(key)) return inflight.get(key);

    const current = now();
    const userOld = perUser.get(rescueId);
    const userWindow = userOld && current - userOld.since < RATE_WINDOW_MS
      ? userOld : { since: current, count: 0 };
    if (current - processMinute.since >= RATE_WINDOW_MS) processMinute = { since: current, count: 0 };
    const today = new Date(current).toISOString().slice(0, 10);
    if (processDay.day !== today) processDay = { day: today, count: 0 };
    if (userWindow.count >= userMinuteLimit || processMinute.count >= processMinuteLimit ||
        processDay.count >= processDayLimit) {
      throw serviceError("ROUTE_RATE_LIMITED", 429, "Route matrix quota guard reached");
    }
    userWindow.count++;
    perUser.set(rescueId, userWindow);
    processMinute.count++;
    processDay.count++;
    if (perUser.size > 500) {
      for (const [id, value] of perUser) if (current - value.since >= RATE_WINDOW_MS) perUser.delete(id);
      if (perUser.size > 500) perUser.delete(perUser.keys().next().value);
    }

    const pending = Promise.resolve().then(async () => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const response = await fetchImplementation(MATRIX_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: apiKey.trim() },
          body: JSON.stringify({
            locations: [[from.longitude, from.latitude],
              ...rows.map((row) => [row.destination.longitude, row.destination.latitude])],
            sources: ["0"],
            destinations: rows.map((_, index) => String(index + 1)),
            metrics: ["distance"], units: "m", resolve_locations: false,
          }),
          signal: abort.signal,
        });
        if (!response.ok) {
          if ([403, 429].includes(response.status)) {
            throw serviceError("ROUTES_PROVIDER_LIMITED", 503, "Route matrix provider quota reached");
          }
          throw serviceError("ROUTES_PROVIDER_ERROR", 502, "Could not calculate SOS road distances");
        }
        const payload = await response.json();
        const distanceRow = payload?.distances?.[0];
        if (!Array.isArray(payload?.distances) || payload.distances.length !== 1 ||
            !Array.isArray(distanceRow) || distanceRow.length !== rows.length ||
            !distanceRow.every((value) => value === null ||
              (typeof value === "number" && Number.isFinite(value) && value >= 0 &&
                Number.isSafeInteger(Math.round(value))))) {
          throw serviceError("ROUTES_BAD_RESPONSE", 502, "Invalid route matrix distances");
        }
        const value = {
          results: rows.map((row, index) => ({ requestId: row.requestId,
            distanceMeters: distanceRow[index] === null ? null : Math.round(distanceRow[index]) })),
          travelMode: "DRIVE", provider: "openrouteservice",
        };
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, { value, expires: now() + CACHE_TTL_MS });
        return value;
      } catch (error) {
        if (abort.signal.aborted || error.name === "AbortError") {
          throw serviceError("ROUTES_TIMEOUT", 504, "Route matrix timed out");
        }
        if (error.code && error.statusCode) throw error;
        throw serviceError("ROUTES_PROVIDER_ERROR", 502, "Could not calculate SOS road distances");
      } finally {
        clearTimeout(timer);
        inflight.delete(key);
      }
    });
    inflight.set(key, pending);
    return pending;
  }
  return { estimateBatch };
}

module.exports = { createRescueRouteMatrixService, MAX_DESTINATIONS, MATRIX_URL };
