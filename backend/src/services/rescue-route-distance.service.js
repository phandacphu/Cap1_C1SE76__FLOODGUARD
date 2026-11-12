"use strict";

// HeiGIT's current public openrouteservice URL (old api.openrouteservice.org is deprecated).
const ORS_DIRECTIONS_URL = "https://api.heigit.org/openrouteservice/v2/directions/driving-car/json";
const CACHE_TTL_MS = 120_000;
const MAX_CACHE_ENTRIES = 200;
const RATE_WINDOW_MS = 60_000;
const MAX_CALLS_PER_USER_MINUTE = 10;
// Below the free Standard plan's advertised 40/minute and 2,000/day.
// Process-local guard only: ORS account quotas are authoritative across restarts/instances.
const MAX_CALLS_PER_PROCESS_MINUTE = 30;
const MAX_CALLS_PER_PROCESS_DAY = 1800;
const REQUEST_TIMEOUT_MS = 8_000;

function routeError(code, statusCode, message) {
  return Object.assign(new Error(message), { code, statusCode });
}

function normalizePoint(point, field) {
  if (!point || typeof point !== "object" || Array.isArray(point) ||
      Object.keys(point).sort().join(",") !== "latitude,longitude" ||
      !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
      point.latitude < -90 || point.latitude > 90 ||
      point.longitude < -180 || point.longitude > 180) {
    throw routeError("INVALID_ROUTE_POINT", 400, `${field} must contain valid latitude and longitude`);
  }
  return { latitude: point.latitude, longitude: point.longitude };
}

function createRescueRouteDistanceService({
  fetchImplementation = (...args) => globalThis.fetch(...args),
  apiKeyProvider = () => process.env.ORS_API_KEY,
  now = Date.now,
  timeoutMs = REQUEST_TIMEOUT_MS,
  userMinuteLimit = MAX_CALLS_PER_USER_MINUTE,
  processMinuteLimit = MAX_CALLS_PER_PROCESS_MINUTE,
  processDayLimit = MAX_CALLS_PER_PROCESS_DAY,
} = {}) {
  const cache = new Map();
  const inflight = new Map();
  const userWindows = new Map();
  let processMinute = { startedAt: 0, count: 0 };
  let processDay = { day: "", count: 0 };

  async function estimate({ origin, destination, requestId, rescueId }) {
    const from = normalizePoint(origin, "origin");
    const to = normalizePoint(destination, "destination");
    if (typeof requestId !== "string" || !requestId.trim() ||
        typeof rescueId !== "string" || !rescueId.trim()) {
      throw routeError("INVALID_ROUTE_CONTEXT", 400, "Route context is required");
    }

    const apiKey = apiKeyProvider();
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      throw routeError("ROUTES_NOT_CONFIGURED", 503, "Route distance is not configured");
    }

    // Coalesce jitter at the origin. A moved SOS always needs a new estimate.
    const key = JSON.stringify([rescueId, requestId, from.latitude.toFixed(4),
      from.longitude.toFixed(4), to.latitude, to.longitude]);
    const existing = cache.get(key);
    if (existing && existing.expiresAt > now()) return existing.value;
    if (existing) cache.delete(key);
    if (inflight.has(key)) return inflight.get(key);

    const current = now();
    const prior = userWindows.get(rescueId);
    const userWindow = prior && current - prior.startedAt < RATE_WINDOW_MS
      ? prior : { startedAt: current, count: 0 };
    if (current - processMinute.startedAt >= RATE_WINDOW_MS) {
      processMinute = { startedAt: current, count: 0 };
    }
    const utcDay = new Date(current).toISOString().slice(0, 10);
    if (processDay.day !== utcDay) processDay = { day: utcDay, count: 0 };
    if (userWindow.count >= userMinuteLimit || processMinute.count >= processMinuteLimit ||
        processDay.count >= processDayLimit) {
      throw routeError("ROUTE_RATE_LIMITED", 429, "Route distance quota reached. Try again later");
    }
    userWindow.count += 1;
    userWindows.set(rescueId, userWindow);
    processMinute.count += 1;
    processDay.count += 1;
    if (userWindows.size > 500) {
      for (const [id, value] of userWindows) {
        if (current - value.startedAt >= RATE_WINDOW_MS) userWindows.delete(id);
      }
      if (userWindows.size > 500) userWindows.delete(userWindows.keys().next().value);
    }

    const pending = Promise.resolve().then(async () => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        // ORS needs [longitude, latitude], unlike the Mobile and Backend DTO.
        const response = await fetchImplementation(ORS_DIRECTIONS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: apiKey.trim(),
          },
          body: JSON.stringify({
            coordinates: [
              [from.longitude, from.latitude],
              [to.longitude, to.latitude],
            ],
            units: "m",
            geometry: false,
            instructions: false,
          }),
          signal: abort.signal,
        });
        if (!response.ok) {
          if (response.status === 429) {
            throw routeError("ROUTES_PROVIDER_LIMITED", 503, "Distance provider quota reached");
          }
          // Distinguish actual no-route errors from incorrect URL/key failures.
          if (response.status === 400 || response.status === 404) {
            const payload = await response.json().catch(() => null);
            const providerCode = Number(payload?.error?.code);
            if ([2009, 2016].includes(providerCode)) {
              throw routeError("ROUTE_NOT_FOUND", 404, "No driving route found");
            }
            if (providerCode === 2010) {
              throw routeError("ROUTE_POINT_UNREACHABLE", 422, "GPS point is too far from a drivable road");
            }
          }
          throw routeError("ROUTES_PROVIDER_ERROR", 502, "Could not calculate route distance");
        }
        const payload = await response.json();
        if (!Array.isArray(payload?.routes) || payload.routes.length === 0) {
          throw routeError("ROUTE_NOT_FOUND", 404, "No driving route found");
        }
        const rawMeters = payload.routes[0]?.summary?.distance;
        if (typeof rawMeters !== "number" || !Number.isFinite(rawMeters) || rawMeters < 0 ||
            !Number.isSafeInteger(Math.round(rawMeters))) {
          throw routeError("ROUTES_BAD_RESPONSE", 502, "Distance provider returned an invalid route");
        }
        const meters = Math.round(rawMeters);
        const value = {
          distanceMeters: meters,
          distanceKm: Math.round(meters / 100) / 10,
          travelMode: "DRIVE",
          provider: "openrouteservice",
          calculatedAt: new Date(now()).toISOString(),
        };
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
        return value;
      } catch (error) {
        if (abort.signal.aborted || error.name === "AbortError") {
          throw routeError("ROUTES_TIMEOUT", 504, "Route distance request timed out");
        }
        if (error.code && error.statusCode) throw error;
        throw routeError("ROUTES_PROVIDER_ERROR", 502, "Could not calculate route distance");
      } finally {
        clearTimeout(timer);
        inflight.delete(key);
      }
    });
    inflight.set(key, pending);
    return pending;
  }

  return { estimate };
}

module.exports = { createRescueRouteDistanceService, normalizePoint };
