const { listFloodAreasForAdmin } = require("./admin-flood-area.service");

const STATUSES = ["active", "inactive"];

const SEVERITIES = ["low", "medium", "high", "critical"];

// CCF-160: Get aggregated Flood Area statistics
// for the Admin dashboard.
async function getFloodAreaSummaryStatisticsForAdmin(actorId) {
  // Reuse existing active Admin authorization
  // and Firestore read logic.
  const floodAreas = await listFloodAreasForAdmin(actorId);

  const summary = {
    total: 0,
    byStatus: {
      active: 0,
      inactive: 0,
    },
    bySeverity: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
  };

  for (const area of floodAreas) {
    summary.total++;

    if (STATUSES.includes(area.status)) {
      summary.byStatus[area.status]++;
    }

    if (SEVERITIES.includes(area.severity)) {
      summary.bySeverity[area.severity]++;
    }
  }

  return summary;
}

module.exports = {
  getFloodAreaSummaryStatisticsForAdmin,
};
