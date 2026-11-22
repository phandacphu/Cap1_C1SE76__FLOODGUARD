const { pushConfiguration } = require("./warning-v2-push-policy");
const { startWarningV2EventWorker } = require("./warning-v2-event-scheduler.service");

function productionSender(config) {
  const { db } = require("../config/firebase");
  const { getMessaging } = require("firebase-admin/messaging");
  const { createWarningZonesService } = require("./warning-v2-zones.service");
  const { createWarningV2PushSender } = require("./warning-v2-push-sender.service");
  return createWarningV2PushSender({ db, zonesService: createWarningZonesService({ db }),
    provider: { send: (message) => getMessaging().send(message) }, allows: config.allows });
}
function startWarningV2PushSender({ env = process.env, createSender = productionSender, ...options } = {}) {
  const config = pushConfiguration(env);
  return startWarningV2EventWorker({ ...options, enabled: config.enabled,
    createWorker: () => createSender(config), onFailure: options.onFailure || (() => console.warn("[WarningV2Push] SCAN_FAILED")) });
}
module.exports = { startWarningV2PushSender };
