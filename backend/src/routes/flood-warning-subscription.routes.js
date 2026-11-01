const express = require("express");

const {
  getMyFloodWarningSubscription,
  updateMyFloodWarningSubscription,
} = require("../controllers/flood-warning-subscription.controller");

const { authenticateToken } = require("../middleware/auth.middleware");

const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(
  authenticateToken,
  authorizeRoles("resident", "rescue_staff", "admin"),
);

router.get("/:areaId", getMyFloodWarningSubscription);
router.put("/:areaId", updateMyFloodWarningSubscription);

module.exports = router;
