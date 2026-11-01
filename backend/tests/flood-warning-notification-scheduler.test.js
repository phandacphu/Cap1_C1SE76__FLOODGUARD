const assert = require("node:assert/strict");

const schedulerPath =
  require.resolve("../src/services/flood-warning-notification-scheduler.service");
const firebasePath = require.resolve("../src/config/firebase");
const workerPath =
  require.resolve("../src/services/flood-warning-notification-worker.service");

const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const originalEnabled = process.env.FLOOD_WARNING_NOTIFICATION_WORKER_ENABLED;

let records = [];
let calls = [];
let fetchedPages = [];
let timers = [];
let sendBatch;

function timestamp(millis) {
  return { toMillis: () => millis };
}

function event(id, overrides = {}) {
  return {
    id,
    status: "pending",
    availableAt: timestamp(Date.now() - 60000),
    ...overrides,
  };
}

function newQuery(cursor = null, limit = null) {
  return {
    where(field, operator, value) {
      assert.equal(field, "status");
      assert.equal(operator, "==");
      assert.equal(value, "pending");
      return this;
    },
    orderBy() {
      return this;
    },
    limit(value) {
      return newQuery(cursor, value);
    },
    startAfter(value) {
      return newQuery(value, limit);
    },
    async get() {
      assert.equal(limit, 20);

      const selected = records
        .filter(
          (item) =>
            item.status === "pending" && (cursor === null || item.id > cursor),
        )
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, limit);

      fetchedPages.push(selected.length);

      return {
        empty: selected.length === 0,
        size: selected.length,
        docs: selected.map((item) => ({
          id: item.id,
          data: () => ({ ...item }),
        })),
      };
    },
  };
}

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    db: {
      collection(name) {
        assert.equal(name, "flood_warning_notification_events");
        return newQuery();
      },
    },
  },
};

require.cache[workerPath] = {
  id: workerPath,
  filename: workerPath,
  loaded: true,
  exports: {
    async processFloodWarningEventBatch(id, batchSize) {
      assert.equal(batchSize, 20);
      calls.push(id);
      return sendBatch(id);
    },
  },
};

function reset(items = []) {
  records = items;
  calls = [];
  fetchedPages = [];
  timers = [];

  sendBatch = async (id) => {
    records.find((item) => item.id === id).status = "completed";
    return { created: 1, code: "EVENT_COMPLETED" };
  };

  delete require.cache[schedulerPath];
  return require(schedulerPath);
}

function installFakeTimers() {
  global.setTimeout = (callback, delay) => {
    const timer = {
      callback,
      delay,
      cancelled: false,
      fired: false,
      unref() {},
    };
    timers.push(timer);
    return timer;
  };

  global.clearTimeout = (timer) => {
    timer.cancelled = true;
  };
}

function fireNextTimer() {
  const timer = timers.find((item) => !item.cancelled && !item.fired);
  assert.ok(timer, "Expected a scheduled timer");
  timer.fired = true;
  timer.callback();
  return timer;
}

function activeTimers() {
  return timers.filter((item) => !item.cancelled && !item.fired);
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function runTests() {
  let passed = 0;

  function pass(name) {
    passed++;
    console.log(`PASS ${passed}: ${name}`);
  }

  let stopScheduler = null;

  try {
    let scheduler = reset();
    let result = await scheduler.runDueFloodWarningEvents();
    assert.equal(result.scanned, 0);
    assert.equal(result.processedEvents, 0);
    pass("Empty queue");

    scheduler = reset([
      event("due"),
      event("future", {
        availableAt: timestamp(Date.now() + 86400000),
      }),
      event("locked", {
        processingLeaseUntil: timestamp(Date.now() + 60000),
      }),
      event("invalid", { availableAt: null }),
    ]);

    result = await scheduler.runDueFloodWarningEvents();
    assert.deepEqual(calls, ["due"]);
    assert.equal(result.created, 1);
    pass("Only due and unlocked events processed");

    scheduler = reset(
      Array.from({ length: 7 }, (_, index) => event(`event_${index}`)),
    );

    result = await scheduler.runDueFloodWarningEvents();
    assert.equal(result.processedEvents, 5);
    assert.equal(calls.length, 5);

    result = await scheduler.runDueFloodWarningEvents();
    assert.equal(result.processedEvents, 2);
    assert.equal(new Set(calls).size, 7);
    pass("Five-event limit and continuation");

    scheduler = reset([
      ...Array.from({ length: 21 }, (_, index) =>
        event(`a_${String(index).padStart(3, "0")}`, {
          availableAt: timestamp(Date.now() + 86400000),
        }),
      ),
      event("z_ready"),
    ]);

    result = await scheduler.runDueFloodWarningEvents();
    assert.equal(result.scanned, 20);
    assert.equal(result.processedEvents, 0);

    result = await scheduler.runDueFloodWarningEvents();
    assert.deepEqual(calls, ["z_ready"]);
    assert.ok(fetchedPages.every((size) => size <= 20));
    pass("Scan limit does not permanently block later ready events");

    scheduler = reset([event("a_failed"), event("b_ready")]);

    sendBatch = async (id) => {
      if (id === "a_failed") {
        return { created: 0, code: "EVENT_PROCESSING_FAILED" };
      }
      return { created: 1, code: "EVENT_COMPLETED" };
    };

    result = await scheduler.runDueFloodWarningEvents();
    assert.equal(result.failedEvents, 1);
    assert.equal(result.created, 1);
    assert.deepEqual(calls, ["a_failed", "b_ready"]);
    pass("Failed event does not block other events");

    scheduler = reset([event("a_throw"), event("b_ready")]);

    sendBatch = async (id) => {
      if (id === "a_throw") {
        throw new Error("MOCK_WORKER_FAILURE");
      }
      return { created: 1, code: "EVENT_COMPLETED" };
    };

    result = await scheduler.runDueFloodWarningEvents();
    assert.equal(result.failedEvents, 1);
    assert.equal(result.created, 1);
    pass("Worker exception contained");

    installFakeTimers();

    scheduler = reset([event("ready")]);
    delete process.env.FLOOD_WARNING_NOTIFICATION_WORKER_ENABLED;

    stopScheduler = scheduler.startFloodWarningNotificationScheduler();

    assert.equal(activeTimers().length, 0);
    assert.equal(calls.length, 0);
    await stopScheduler();
    stopScheduler = null;
    pass("Scheduler disabled by default");

    scheduler = reset([event("ready")]);
    process.env.FLOOD_WARNING_NOTIFICATION_WORKER_ENABLED = "true";

    stopScheduler = scheduler.startFloodWarningNotificationScheduler();

    assert.equal(activeTimers().length, 1);
    assert.equal(activeTimers()[0].delay, 1000);

    fireNextTimer();
    await flushPromises();

    assert.deepEqual(calls, ["ready"]);
    assert.equal(activeTimers().length, 1);
    assert.equal(activeTimers()[0].delay, 60000);

    await stopScheduler();
    stopScheduler = null;
    assert.equal(activeTimers().length, 0);
    pass("Enabled scheduler runs and schedules next tick after completion");

    scheduler = reset([event("slow")]);
    let releaseWorker;

    sendBatch = () =>
      new Promise((resolve) => {
        releaseWorker = resolve;
      });

    stopScheduler = scheduler.startFloodWarningNotificationScheduler();

    fireNextTimer();
    await flushPromises();

    assert.deepEqual(calls, ["slow"]);
    assert.equal(activeTimers().length, 0);

    let stopped = false;
    const stopping = stopScheduler().then(() => {
      stopped = true;
    });

    await flushPromises();
    assert.equal(stopped, false);

    releaseWorker({ created: 0, code: "EVENT_COMPLETED" });
    await stopping;
    stopScheduler = null;

    assert.equal(stopped, true);
    assert.equal(activeTimers().length, 0);
    pass("Stop waits for current tick and prevents overlapping ticks");

    scheduler = reset([event("ready")]);

    stopScheduler = scheduler.startFloodWarningNotificationScheduler();

    await stopScheduler();
    stopScheduler = null;

    assert.equal(activeTimers().length, 0);
    assert.equal(calls.length, 0);
    pass("Stop cancels timer before first tick");

    console.log(`All ${passed} scheduler mock tests passed`);
  } finally {
    if (stopScheduler) {
      await stopScheduler();
    }

    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;

    if (originalEnabled === undefined) {
      delete process.env.FLOOD_WARNING_NOTIFICATION_WORKER_ENABLED;
    } else {
      process.env.FLOOD_WARNING_NOTIFICATION_WORKER_ENABLED = originalEnabled;
    }
  }
}

runTests().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
