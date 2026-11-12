"use strict";

const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const { getUserById } = require("../services/user.service");
const { getRescueRequestById } = require("../services/rescue-request.service");
const { createRescueRouteDistanceService } = require("../services/rescue-route-distance.service");
const { createRescueRouteDistanceController } = require("../controllers/rescue-route-distance.controller");
const { createRescueRouteMatrixController } = require("../controllers/rescue-route-matrix.controller");
const { createRescueRouteMatrixService } = require("../services/rescue-route-matrix.service");

const router = express.Router();
const routeDistanceService = createRescueRouteDistanceService();
const controller = createRescueRouteDistanceController({
  findUser: getUserById,
  findRequest: getRescueRequestById,
  estimate: routeDistanceService.estimate,
});

const routeMatrixService = createRescueRouteMatrixService();
const matrixController = createRescueRouteMatrixController({
  findUser: getUserById,
  findRequest: getRescueRequestById,
  estimateBatch: routeMatrixService.estimateBatch,
});

// JWT and Rescue RBAC apply to both endpoints; Firebase is read-only here.
router.post("/batch", authenticateToken, authorizeRoles("rescue"), matrixController);
// Read-only with respect to Firestore; ORS API key remains server-side.
router.post("/", authenticateToken, authorizeRoles("rescue"), controller);

module.exports = router;
