function productionWorker() {
  const { db } = require("../config/firebase");
  const { createWarningZonesService } = require("./warning-v2-zones.service");
  return require("./warning-v2-event-worker.service").createWarningV2EventWorker({ db, zonesService: createWarningZonesService({ db }) });
}

function startWarningV2EventWorker({ enabled = process.env.FLOOD_WARNING_V2_EVENT_WORKER_ENABLED === "true",
  createWorker = productionWorker, intervalMs = 15000, setTimer = setTimeout, clearTimer = clearTimeout,
  onSummary = () => {}, onFailure = () => console.warn("[WarningV2Worker] SCAN_FAILED") } = {}) {
  if (enabled !== true) return async () => {};
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 300000) throw new Error("Invalid worker interval");
  const worker = createWorker();
  let stopped = false, timer = null, inFlight = null;
  function schedule(delay) {
    timer = setTimer(() => {
      timer = null;
      if (stopped) return;
      inFlight = Promise.resolve().then(() => worker.tick()).then((summary) => {
        if (summary.failedScans.length) onFailure();
        onSummary(summary);
      }).catch(() => onFailure()).finally(() => {
        inFlight = null;
        if (!stopped) schedule(intervalMs);
      });
    }, delay);
    timer?.unref?.();
  }
  schedule(0);
  return async () => {
    stopped = true;
    if (timer !== null) { clearTimer(timer); timer = null; }
    if (inFlight) await inFlight;
  };
}
module.exports = { startWarningV2EventWorker };
