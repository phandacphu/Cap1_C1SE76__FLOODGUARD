const REQUEST_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;

function forecastError(message, code, details = {}, cause) {
  return Object.assign(new Error(message, { cause }), { code, ...details });
}

function retryAfterMilliseconds(value, now) {
  if (typeof value !== "string" || !value.trim()) return RATE_LIMIT_COOLDOWN_MS;
  const milliseconds = /^\d+$/.test(value.trim())
    ? Number(value) * 1000
    : Date.parse(value) - now;
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? milliseconds
    : RATE_LIMIT_COOLDOWN_MS;
}

async function fetchJson(url, fetchImplementation = fetch, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw forecastError(
        `External API returned status ${response.status}`,
        "FORECAST_UPSTREAM_HTTP",
        {
          upstreamStatus: response.status,
          retryAfter: response.headers?.get("retry-after") ?? null,
        },
      );
    }
    try {
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted || error.name === "AbortError") throw error;
      if (!(error instanceof SyntaxError)) throw error;
      throw forecastError("External API returned invalid JSON", "FORECAST_UPSTREAM_DATA", {}, error);
    }
  } catch (error) {
    if (controller.signal.aborted || error.name === "AbortError") {
      throw forecastError("External API request timed out", "FORECAST_UPSTREAM_TIMEOUT", {}, error);
    }
    if (error.code?.startsWith("FORECAST_")) throw error;
    throw forecastError("External API request failed", "FORECAST_UPSTREAM_NETWORK", {
      causeCode: error.cause?.code ?? error.code ?? null,
    }, error);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Each process shares one client. Keep successes, in-flight work and 429 cooldowns
// separate so a failing source never discards or refetches the healthy source.
function createOpenMeteoClient({
  fetchImplementation = (...args) => globalThis.fetch(...args),
  now = Date.now,
  logger = console,
  timeoutMs = REQUEST_TIMEOUT_MS,
  cacheTtlMs = CACHE_TTL_MS,
  maxEntries = 128,
  maxInFlight = 32,
} = {}) {
  const cache = new Map();
  const inFlight = new Map();
  const cooldowns = new Map();

  async function getJson(url, source, validate) {
    const key = `${source}:${url}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.data;
    cache.delete(key);
    if (inFlight.has(key)) return inFlight.get(key);

    const blockedUntil = cooldowns.get(source) ?? 0;
    if (blockedUntil > now()) {
      throw forecastError("External API returned status 429", "FORECAST_UPSTREAM_HTTP", {
        source,
        upstreamStatus: 429,
        retryAfterSeconds: Math.ceil((blockedUntil - now()) / 1000),
        cooldown: true,
      });
    }
    if (inFlight.size >= maxInFlight) {
      throw forecastError("Forecast request capacity reached", "FORECAST_BUSY", { source });
    }

    const startedAt = now();
    // Defer the fetch until after registering it, including synchronously failing mocks.
    const pending = Promise.resolve().then(async () => {
      try {
        const data = await fetchJson(url, fetchImplementation, timeoutMs);
        if (!validate(data)) {
          throw forecastError("External API returned invalid forecast data", "FORECAST_UPSTREAM_DATA");
        }
        for (const [entryKey, entry] of cache) {
          if (entry.expiresAt <= now()) cache.delete(entryKey);
        }
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
        cache.set(key, { data, expiresAt: now() + cacheTtlMs });
        logger.info("Open-Meteo upstream result:", {
          source, upstreamStatus: 200, durationMs: now() - startedAt,
        });
        return data;
      } catch (error) {
        error.source = source;
        if (error.upstreamStatus === 429) {
          const duration = retryAfterMilliseconds(error.retryAfter, now());
          const until = Math.max(cooldowns.get(source) ?? 0, now() + duration);
          cooldowns.set(source, until);
          error.retryAfterSeconds = Math.ceil((until - now()) / 1000);
        }
        // Deliberately exclude URL/GPS, raw response bodies and credentials.
        logger.error("Open-Meteo upstream error:", {
          source,
          code: error.code,
          upstreamStatus: error.upstreamStatus ?? null,
          causeCode: error.causeCode ?? error.cause?.code ?? null,
          retryAfterSeconds: error.retryAfterSeconds ?? null,
          durationMs: now() - startedAt,
        });
        throw error;
      } finally {
        inFlight.delete(key);
      }
    });
    inFlight.set(key, pending);
    return pending;
  }
  return { getJson };
}

module.exports = { createOpenMeteoClient, fetchJson, forecastError, retryAfterMilliseconds };
