const { test } = require("node:test");
const assert = require("node:assert/strict");
const { startWarningV2EventWorker } = require("../src/services/warning-v2-event-scheduler.service");
const flush = () => new Promise((resolve) => setImmediate(resolve));
function timers() {
  const pending = new Map(); let next = 0;
  return { pending, setTimer(fn, delay) { const id = ++next; pending.set(id, { fn, delay }); return id; },
    clearTimer(id) { pending.delete(id); }, fire() { const [id, timer] = pending.entries().next().value; pending.delete(id); timer.fn(); } };
}
test("scheduler disabled by default does not initialize Firebase or schedule work", async () => {
  const t = timers(); let created = 0;
  for (const enabled of [false, "true", undefined]) {
    const previous = process.env.FLOOD_WARNING_V2_EVENT_WORKER_ENABLED; delete process.env.FLOOD_WARNING_V2_EVENT_WORKER_ENABLED;
    try { const stop = startWarningV2EventWorker({ enabled, createWorker() { created++; }, ...t }); await stop(); }
    finally { if (previous === undefined) delete process.env.FLOOD_WARNING_V2_EVENT_WORKER_ENABLED; else process.env.FLOOD_WARNING_V2_EVENT_WORKER_ENABLED = previous; }
  }
  assert.equal(created, 0); assert.equal(t.pending.size, 0);
});
test("scheduler never overlaps ticks and stop waits for in-flight work without rescheduling", async () => {
  const t = timers(); let done, calls = 0;
  const stop = startWarningV2EventWorker({ enabled: true, createWorker: () => ({ tick() { calls++; return new Promise((r) => { done = r; }); } }), ...t });
  t.fire(); await flush(); assert.equal(calls, 1); assert.equal(t.pending.size, 0);
  let stopped = false; const ending = stop().then(() => { stopped = true; }); await flush(); assert.equal(stopped, false);
  done({ failedScans: [] }); await ending; assert.equal(stopped, true); assert.equal(t.pending.size, 0);
});
test("scheduler contains worker failure and retries on the next interval; malformed configuration rejected", async () => {
  const t = timers(); let errors = 0;
  const stop = startWarningV2EventWorker({ enabled: true, createWorker: () => ({ async tick() { throw new Error("PRIVATE_DB_ERROR"); } }),
    onFailure: () => { errors++; }, ...t });
  t.fire(); await flush(); assert.equal(errors, 1); assert.equal(t.pending.size, 1);
  assert.equal([...t.pending.values()][0].delay, 15000); await stop(); assert.equal(t.pending.size, 0);
  assert.throws(() => startWarningV2EventWorker({ enabled: true, intervalMs: 0 }), /Invalid worker interval/);
});
