const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { db } = require("../config/firebase");

const {
  evaluateFloodWarningNotification,
} = require("./flood-warning-notification-rule.service");

const FLOOD_WARNING_EVENTS_COLLECTION = "flood_warning_notification_events";

function stageFloodWarningNotificationEvent(
  transaction,
  alertId,
  revision,
  previous,
  current,
  area,
) {
  const result = evaluateFloodWarningNotification(previous, current, area);

  // Future warnings are retained for processing at their start time.
  if (!result.eligible && result.reason !== "NOT_STARTED") {
    return;
  }

  const eventRef = db.collection(FLOOD_WARNING_EVENTS_COLLECTION).doc(revision);

  transaction.create(eventRef, {
    alertId,
    revision,
    status: "pending",
    availableAt: Timestamp.fromMillis(
      Math.max(Date.now(), current.startAt.toMillis()),
    ),
    createdAt: FieldValue.serverTimestamp(),
  });
}

module.exports = {
  FLOOD_WARNING_EVENTS_COLLECTION,
  stageFloodWarningNotificationEvent,
};
