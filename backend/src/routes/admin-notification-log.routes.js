const express = require("express");

const {
  listAdminNotificationLogs,
} = require("../controllers/admin-notification-log.controller");

const { authenticateToken } = require("../middleware/auth.middleware");

const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("admin"));
router.get("/", listAdminNotificationLogs);

module.exports = router;
