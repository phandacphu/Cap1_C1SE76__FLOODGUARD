const { listFloodAlertsForAdmin } = require("./admin-flood-alert.service");

const SEVERITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["active", "inactive"];

function invalidQuery(message) {
  const error = new Error(message);
  error.code = "INVALID_WARNING_STATS_QUERY";
  error.statusCode = 400;
  return error;
}

function parseDateParameter(value, name) {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw invalidQuery(`${name} must be an ISO 8601 datetime`);
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );

  if (!match) {
    throw invalidQuery(`${name} must be an ISO 8601 datetime with timezone`);
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    zone,
  ] = match;

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  calendarDate.setUTCHours(0, 0, 0, 0);

  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw invalidQuery(`${name} contains an invalid date or time`);
  }

  if (zone !== "Z") {
    const zoneHours = Number(zone.slice(1, 3));
    const zoneMinutes = Number(zone.slice(4, 6));

    if (
      zoneHours > 14 ||
      zoneMinutes > 59 ||
      (zoneHours === 14 && zoneMinutes !== 0)
    ) {
      throw invalidQuery(`${name} contains an invalid timezone`);
    }
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw invalidQuery(`${name} contains an invalid datetime`);
  }

  return timestamp;
}

function normalizeStatisticsQuery(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    throw invalidQuery("Invalid statistics query");
  }

  const keys = Object.keys(query);

  // CCF-161: Support status and severity in addition to date range.
  if (keys.some((key) => !["from", "to", "status", "severity"].includes(key))) {
    throw invalidQuery("Only from, to, status and severity are supported");
  }

  const from = parseDateParameter(query.from, "from");
  const to = parseDateParameter(query.to, "to");

  if (from !== null && to !== null && from > to) {
    throw invalidQuery("from must not be later than to");
  }

  // CCF-161: Validate status and severity filters.
  const { status, severity } = query;

  if (
    status !== undefined &&
    (typeof status !== "string" || !STATUSES.includes(status))
  ) {
    throw invalidQuery("Invalid status filter");
  }

  if (
    severity !== undefined &&
    (typeof severity !== "string" || !SEVERITIES.includes(severity))
  ) {
    throw invalidQuery("Invalid severity filter");
  }

  return { from, to, status, severity };
}

async function getWarningSummaryStatisticsForAdmin(actorId, query = {}) {
  const { from, to, status, severity } = normalizeStatisticsQuery(query);

  // Reuse the existing Admin authorization and Firestore read.
  const alerts = await listFloodAlertsForAdmin(actorId);

  const summary = {
    total: 0,
    bySeverity: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
    byStatus: {
      active: 0,
      inactive: 0,
    },
  };

  for (const alert of alerts) {
    // CCF-161: Apply status and severity filters.
    if (status !== undefined && alert.status !== status) {
      continue;
    }

    if (severity !== undefined && alert.severity !== severity) {
      continue;
    }

    // Keep the existing inclusive date-range filtering.
    if (from !== null || to !== null) {
      const createdAt = alert.createdAt ? Date.parse(alert.createdAt) : NaN;

      if (!Number.isFinite(createdAt)) {
        continue;
      }

      if (from !== null && createdAt < from) {
        continue;
      }

      if (to !== null && createdAt > to) {
        continue;
      }
    }

    // Count only warnings matching all supplied filters.
    summary.total++;

    if (SEVERITIES.includes(alert.severity)) {
      summary.bySeverity[alert.severity]++;
    }

    if (STATUSES.includes(alert.status)) {
      summary.byStatus[alert.status]++;
    }
  }

  return summary;
}

module.exports = {
  getWarningSummaryStatisticsForAdmin,
};
