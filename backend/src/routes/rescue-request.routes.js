const express = require("express");

const {
  createSos,
  listRescueRequests,
  getRescueRequestDetail,
  acceptRescueRequest,
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

router.get(
  "/:requestId",
  authenticateToken,
  authorizeRoles("resident", "rescue", "admin"),
  getRescueRequestDetail,
);

router.post(
  "/:requestId/accept",
  authenticateToken,
  authorizeRoles("rescue"),
  acceptRescueRequest,
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("resident"),
  createSos,
);

module.exports = router;