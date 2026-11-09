const express = require("express");

const {
  listAdminSafeLocations,
  getAdminSafeLocationDetail,
  createAdminSafeLocation,
  updateAdminSafeLocation,
  deleteAdminSafeLocation,
} = require("../controllers/admin-safe-location.controller");

const { authenticateToken } = require("../middleware/auth.middleware");

const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.use(authenticateToken, authorizeRoles("admin"));

router.get("/", listAdminSafeLocations);
router.get("/:locationId", getAdminSafeLocationDetail);
router.post("/", createAdminSafeLocation);
router.patch("/:locationId", updateAdminSafeLocation);
router.delete("/:locationId", deleteAdminSafeLocation);

module.exports = router;
