# Forecast upstream resilience and Render verification

## Problem and incident evidence

At 20:38:36 Vietnam time on 2026-11-05 (13:38:36 UTC), Render logged
`External API returned status 429` in `getWeatherForecast`. The request to
`/api/flood-forecast?latitude=10.0452&longitude=105.7469` returned 502.
The live deploy was `7ed4f34e1f86e0dbd7df66999f34e85ae3c68ebb`.
Its forecast service is identical to the service in the fix's base,
`c022dcd110d2f96474e767e83dbd606f62bc486a`.

A later request at 13:55:37 UTC reproduced the same Render weather 429/502.
These old logs do not establish whether the river-discharge source succeeded.

Open-Meteo documents rate limits by IP/application and specifically notes that
Render users may encounter limits earlier than expected:
https://open-meteo.com/en/terms
This is a possible explanation, not proof of the exact quota exhausted here.

## Behavior after the fix

- Each process caches successful, validated responses for 10 minutes, keyed by
  source and exact request URL. Coordinates are not rounded or reassigned.
- Concurrent requests for the same source/location share one upstream request.
- The cache holds at most 128 entries and admits at most 32 simultaneous upstream
  requests. Failed responses are never saved as successful forecasts.
- An upstream 429 starts a cooldown for that source across all locations.
  `Retry-After` seconds or an HTTP date are honored; missing/invalid/nonpositive
  values use a 60-second cooldown. No immediate automatic retries are made.
- A still-valid cache entry can serve a location during that cooldown. Expired
  data is not served. There is no silent fallback to fake, zero or stale data.
- Weather and river-discharge sources are collected independently. A healthy
  source remains cached when the other fails. Both results are observed before
  the combined request finishes, enabling source-specific diagnosis.
- The API keeps the existing success and error body contract. A 200 still
  requires both sources to be valid. Upstream HTTP/network/data errors return
  502; upstream timeouts return 504. For a 429 cooldown, the 502 also includes
  a `Retry-After` response header. Missing/invalid coordinates return 400.
- Null discharge measurements remain null. A valid all-null discharge series
  yields `dataAvailable: false`, not zero or a claim of safety.
- No warning thresholds, notification rules, area types or Mobile UI are changed.
  Cache/cooldown durations above are infrastructure controls, not alert settings.

Caches and cooldowns are in memory, per process, and reset on restart. They do
not provide a global quota across multiple instances. Shared provider IP limits
can still cause 429 on a cold start. This patch mitigates request amplification;
it does not guarantee upstream availability or remove the provider's limits.

## Diagnostic logs

Each actual upstream attempt emits `Open-Meteo upstream result:` or
`Open-Meteo upstream error:` with `source: weather|flood`, upstream status,
duration and, on failure, an error code, network cause code and retry delay.
Cooldown/cache hits do not generate new upstream-attempt logs.

`Get flood forecast error:` includes the failed source and a `sources` array
showing whether each source was available or failed. `available` may represent
an unexpired cached result, not a new upstream call. URLs, GPS, raw provider
response bodies and credentials are excluded from these new diagnostic logs.

Useful codes:

| Code | Meaning |
| --- | --- |
| `FORECAST_UPSTREAM_HTTP` | Upstream returned non-2xx; inspect `upstreamStatus` |
| `FORECAST_UPSTREAM_NETWORK` | Fetch/body network failure; inspect `causeCode` |
| `FORECAST_UPSTREAM_TIMEOUT` | The existing 10-second fetch/body timeout expired |
| `FORECAST_UPSTREAM_DATA` | Invalid JSON or invalid forecast structure |
| `FORECAST_BUSY` | Local concurrent upstream-request capacity reached |

## Verification

With backend dependencies installed, from the repository root:

```sh
node --test backend/tests/open-meteo.service.test.js backend/tests/flood-forecast.controller.test.js backend/tests/open-meteo-resilience.test.js backend/tests/flood-forecast.http.test.js
git diff --check
git diff --check origin/develop...HEAD
```

Tests cover concurrency/cache expiry, independent source errors and recovery,
429 cooldown across coordinates, Retry-After, bounded memory/in-flight work,
network cause codes, JSON/body failures, validation, null discharge and the real
Express route's HTTP responses. Upstreams are mocked in automated tests.

A separate, single live check from the development execution environment
returned HTTP 200 from each Open-Meteo source: 72 weather hours, 7 discharge days,
`dataAvailable: true`, first discharge value `43.77`. This check does **not**
confirm connectivity from Render or that the nearest model river is the correct
river for the user's location.

## Required verification after deployment

1. Phu reviews/merges the PR according to the team's merge policy. Render is
   configured to auto-deploy `develop`, but still inspect the actual deploy SHA
   and wait until it is live; the currently observed deploy lags behind develop.
2. Call the endpoint once with the incident coordinates and inspect **both**
   source logs. Confirm HTTP status and any error/cause code independently.
3. If 200, verify `weather.hourly`, `flood.daily`, units, model dates and
   `flood.dataAvailable`; then check Home on the phone. An all-null discharge
   result is a valid unavailable state, not evidence of zero flow.
4. Repeat the same request once: it should use cache, without new upstream logs.
5. If weather still returns 429, read the cooldown/Retry-After logs and wait for
   eligibility rather than repeatedly refreshing. If throttling persists on
   cold starts, a provider/account/network arrangement supported by Open-Meteo
   is needed; do not rotate IPs or relabel another source to conceal the error.

Until this post-deployment check completes, river-source connectivity on Render
and the Home screen's end-to-end recovery remain **unverified**.
