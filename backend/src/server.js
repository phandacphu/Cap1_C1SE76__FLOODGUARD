require("dotenv").config();

const app = require("./app");

const {
  startFloodWarningNotificationScheduler,
} = require("./services/flood-warning-notification-scheduler.service");

const PORT = process.env.PORT || 5000;

let stopScheduler = async () => {};
let shuttingDown = false;

const server = app.listen(PORT, () => {
  console.log(`FLOODGUARD API running on port ${PORT}`);

  stopScheduler = startFloodWarningNotificationScheduler();
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
