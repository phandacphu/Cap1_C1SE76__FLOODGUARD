require("dotenv").config();

const app = require("./app");
const { startWarningV2EventWorker } = require("./services/warning-v2-event-scheduler.service");
const { startWarningV2PushSender } = require("./services/warning-v2-push-scheduler.service");

const {
  startFloodWarningNotificationScheduler,
} = require("./services/flood-warning-notification-scheduler.service");

const PORT = process.env.PORT || 5000;

let stopScheduler = async () => {};
let stopWarningV2Worker = async () => {};
let stopWarningV2Push = async () => {};
let shuttingDown = false;

const server = app.listen(PORT, () => {
  console.log(`FLOODGUARD API running on port ${PORT}`);

  stopScheduler = startFloodWarningNotificationScheduler();
  stopWarningV2Worker = startWarningV2EventWorker();
  stopWarningV2Push = startWarningV2PushSender();
});

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  const timeout = setTimeout(() => {
    console.error("Server shutdown timed out");
    process.exit(1);
  }, 15000);

  timeout.unref();

  try {
    await Promise.all([
      stopScheduler(),
      stopWarningV2Worker(),
      stopWarningV2Push(),
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
    ]);

    clearTimeout(timeout);
    process.exit(0);
  } catch {
    clearTimeout(timeout);
    console.error("Server shutdown failed");
    process.exit(1);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
