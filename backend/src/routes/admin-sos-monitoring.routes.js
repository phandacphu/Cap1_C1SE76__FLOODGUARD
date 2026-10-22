const express = require("express");

const {
  listAdminSosRequests,
  getAdminSosRequestDetail,
  getAdminSosSummaryStatistics,
} = require("../controllers/admin-sos-monitoring.controller");

const { authenticateToken } = require("../middleware/auth.middleware");

const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("admin"));

router.get("/", listAdminSosRequests);

// CCF-158: Keep /summary before /:requestId.
router.get("/summary", getAdminSosSummaryStatistics);

router.get("/:requestId", getAdminSosRequestDetail);

module.exports = router;
