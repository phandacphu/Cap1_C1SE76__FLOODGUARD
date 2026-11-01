const NOTIFICATION_FIELDS = [
  "title",
  "content",
  "severity",
  "status",
  "areaId",
  "startAt",
  "endAt",
];

const ALLOWED_SEVERITIES = ["low", "medium", "high", "critical"];

function getTimestampMillis(value) {
  if (!value || typeof value.toMillis !== "function") {
    return null;
  }

  const millis = value.toMillis();
  return Number.isFinite(millis) ? millis : null;
}

function isTestData(data) {
  if (!data || typeof data !== "object") {
    return false;
  }

  if (data.isTest === true || data.testOnly === true) {
    return true;
  }

  return ["title", "content", "name", "description", "source"].some(
    (field) =>
      typeof data[field] === "string" &&
      /\bTEST[\s_-]*ONLY\b/i.test(data[field]),
  );
}

function hasNotificationChange(previous, current) {
  if (!previous) {
    return true;
  }

  return NOTIFICATION_FIELDS.some((field) => {
    if (field === "startAt" || field === "endAt") {
      return (
        getTimestampMillis(previous[field]) !==
        getTimestampMillis(current[field])
      );
    }

    return previous[field] !== current[field];
  });
}

function evaluateFloodWarningNotification(
  previous,
  current,
  area,
  nowMs = Date.now(),
) {
  if (!Number.isFinite(nowMs)) {
    throw new Error("Invalid notification evaluation time");
  }

  if (
    !current ||
    typeof current.title !== "string" ||
    !current.title.trim() ||
    typeof current.content !== "string" ||
    !current.content.trim() ||
    typeof current.areaId !== "string" ||
    !current.areaId.trim() ||
    !ALLOWED_SEVERITIES.includes(current.severity)
  ) {
    return { eligible: false, reason: "INVALID_ALERT" };
  }

  if (!area) {
    return { eligible: false, reason: "AREA_NOT_FOUND" };
  }

  if (isTestData(current) || isTestData(area)) {
    return { eligible: false, reason: "TEST_DATA" };
  }

  if (current.status !== "active") {
    return { eligible: false, reason: "ALERT_INACTIVE" };
  }

  const startMs = getTimestampMillis(current.startAt);
  const endMs = getTimestampMillis(current.endAt);

  if (startMs === null || endMs === null || startMs >= endMs) {
    return { eligible: false, reason: "INVALID_TIME_WINDOW" };
  }

  if (nowMs < startMs) {
    return { eligible: false, reason: "NOT_STARTED" };
  }

  if (nowMs > endMs) {
    return { eligible: false, reason: "EXPIRED" };
  }

  if (!hasNotificationChange(previous, current)) {
    return { eligible: false, reason: "UNCHANGED" };
  }

  return { eligible: true, reason: "ELIGIBLE" };
}

module.exports = {
  NOTIFICATION_FIELDS,
  isTestData,
  hasNotificationChange,
  evaluateFloodWarningNotification,
};
