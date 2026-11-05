const { listFloodAreasForAdmin } = require("./admin-flood-area.service");

const AREA_TYPES = ["flood", "low_lying", "unclassified"];

function invalidQuery(message) {
  const error = new Error(message);
  error.code = "INVALID_FLOOD_AREA_STATS_QUERY";
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

  if (keys.some((key) => !["from", "to", "areaType"].includes(key))) {
    throw invalidQuery("Only from, to and areaType are supported");
  }

  const from = parseDateParameter(query.from, "from");
  const to = parseDateParameter(query.to, "to");

  if (from !== null && to !== null && from > to) {
    throw invalidQuery("from must not be later than to");
  }

  const { areaType } = query;
  if (areaType !== undefined &&
      (typeof areaType !== "string" || !AREA_TYPES.includes(areaType))) {
    throw invalidQuery("Invalid areaType filter");
  }
  return { from, to, areaType };
}

// CCF-160 + CCF-161: Admin Flood Area statistics with filtering.
async function getFloodAreaSummaryStatisticsForAdmin(actorId, query = {}) {
  const { from, to, areaType } = normalizeStatisticsQuery(query);

  // Reuse existing Admin authorization and Firestore read logic.
  const floodAreas = await listFloodAreasForAdmin(actorId);

  const summary = {
    total: 0,
    byAreaType: {
      flood: 0,
      low_lying: 0,
      unclassified: 0,
    },
  };

  for (const area of floodAreas) {
    const type = area.areaType === null ? "unclassified" : area.areaType;
    if (areaType !== undefined && type !== areaType) continue;

    if (from !== null || to !== null) {
      const createdAt = area.createdAt ? Date.parse(area.createdAt) : NaN;

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

    summary.total++;

    summary.byAreaType[type]++;
  }

  return summary;
}

module.exports = {
  getFloodAreaSummaryStatisticsForAdmin,
};
