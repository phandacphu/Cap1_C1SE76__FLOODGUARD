// READ ONLY. Run locally after configuring your own Firebase credentials.
require("dotenv").config({ quiet: true });
const { db } = require("../src/config/firebase");
const {
  isSoftDeleted,
  isVisibleSafeLocation,
  toClientSafeLocation,
} = require("../src/services/safe-location-contract");
(async () => {
  try {
    const snapshot = await db.collection("safe_locations").get();
    const report = {
      projectId: db.projectId,
      total: snapshot.size,
      visible: 0,
      softDeleted: 0,
      legacyArchived: 0,
      invalid: 0,
      review: [],
    };
    for (const doc of snapshot.docs) {
      const data = doc.data();
      let reason;
      if (isSoftDeleted(data)) {
        report.softDeleted++;
        reason = "soft_deleted";
      } else if (!isVisibleSafeLocation(data)) {
        report.legacyArchived++;
        reason = "legacy_inactive_or_unknown_status";
      } else {
        try {
          toClientSafeLocation({ ...data, id: doc.id });
          report.visible++;
        } catch {
          report.invalid++;
          reason = "invalid_catalogue_fields_or_coordinates";
        }
      }
      if (reason)
        report.review.push({
          id: doc.id,
          name: typeof data.name === "string" ? data.name : null,
          reason,
        });
    }
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error("Could not inspect safe-location catalogue:", error.message);
    process.exitCode = 1;
  } finally {
    await db.terminate();
  }
})();
