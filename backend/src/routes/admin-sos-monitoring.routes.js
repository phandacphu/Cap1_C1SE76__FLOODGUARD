const express = require("express");

const {
  listAdminSosRequests,
  getAdminSosRequestDetail,
} = require("../controllers/admin-sos-monitoring.controller");

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

router.get("/", listAdminSosRequests);
router.get("/:requestId", getAdminSosRequestDetail);

module.exports = router;