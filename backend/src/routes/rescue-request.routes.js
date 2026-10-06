const express = require("express");

const {
  createSos,
} = require("../controllers/rescue-request.controller");

const {
  authenticateToken,
} = require("../middleware/auth.middleware");

const {
  authorizeRoles,
} = require("../middleware/rbac.middleware");

const router = express.Router();

router.post(
  "/",
  authenticateToken,
  authorizeRoles("resident"),
  createSos,
);

module.exports = router;