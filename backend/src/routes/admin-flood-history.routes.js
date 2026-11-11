const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const {
  listHistoricalAreasForAdmin,
  getHistoricalAreaForAdmin,
  updateHistoricalArea,
  deleteHistoricalArea,
} = require("../services/historical-flood-area.service");

const router = express.Router();
router.use(authenticateToken, authorizeRoles("admin"));

function handler(operation, message) {
  return async (req, res) => {
    try {
      const data = await operation(req);
      return res.json({ success: true, message, data });
    } catch (error) {
      if ([400, 401, 403, 404].includes(error.statusCode)) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
          code: error.code,
        });
      }
      console.error("Admin historical flood area operation failed", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
}

router.get("/", handler(async (req) => ({
  floodAreas: await listHistoricalAreasForAdmin(req.user.id),
}), "Historical flood areas retrieved successfully"));

router.get("/:id", handler(async (req) => ({
  floodArea: await getHistoricalAreaForAdmin(req.user.id, req.params.id),
}), "Historical flood area retrieved successfully"));

router.patch("/:id", handler(async (req) => ({
  floodArea: await updateHistoricalArea(req.user.id, req.params.id, req.body),
}), "Historical flood area updated successfully"));

router.delete("/:id", handler(async (req) => {
  if (req.body !== undefined && (
    !req.body || typeof req.body !== "object" ||
    Array.isArray(req.body) || Object.keys(req.body).length > 0
  )) {
    const error = new Error("Delete body must be empty or an empty object");
    error.statusCode = 400;
    error.code = "INVALID_HISTORICAL_FLOOD_AREA";
    throw error;
  }
  return deleteHistoricalArea(req.user.id, req.params.id);
}, "Historical flood area deleted successfully"));

module.exports = router;
