const express = require("express");

const {
  listAdminFloodAlerts,
  getAdminFloodAlertDetail,
  createAdminFloodAlert,
  updateAdminFloodAlert,
} = require("../controllers/admin-flood-alert.controller");

const {
  authenticateToken,
} = require("../middleware/auth.middleware");

const {
  authorizeRoles,
} = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(
  authenticateToken,
  authorizeRoles("admin"),
);

router.get("/", listAdminFloodAlerts);
router.get("/:alertId", getAdminFloodAlertDetail);
router.post("/", createAdminFloodAlert);
router.patch("/:alertId", updateAdminFloodAlert);

module.exports = router;