const express = require("express");

const {
  createSos,
  listRescueRequests,
  getRescueRequestDetail,
  getRescueRequestHistory,
  acceptRescueRequest,
  updateRescueRequestStatus,
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
  "/:requestId/history",
  authenticateToken,
  authorizeRoles("resident", "rescue", "admin"),
  getRescueRequestHistory,
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

router.patch(
  "/:requestId/status",
  authenticateToken,
  authorizeRoles("rescue"),
  updateRescueRequestStatus,
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("resident"),
  createSos,
);

module.exports = router;