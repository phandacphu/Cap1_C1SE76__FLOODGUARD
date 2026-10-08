const express = require("express");

const {
  createSos,
  listRescueRequests,
} = require("../controllers/rescue-request.controller");

const {
  authenticateToken,
} = require("../middleware/auth.middleware");

const {
  authorizeRoles,
} = require("../middleware/rbac.middleware");

const router = express.Router();

router.get(
  "/",
  authenticateToken,
  authorizeRoles("resident", "rescue", "admin"),
  listRescueRequests,
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("resident"),
  createSos,
);

module.exports = router;