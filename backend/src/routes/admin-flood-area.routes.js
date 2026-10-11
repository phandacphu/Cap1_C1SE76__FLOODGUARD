const express = require("express");

const {
  listAdminFloodAreas,
  getAdminFloodAreaDetail,
  createAdminFloodArea,
  updateAdminFloodArea,
  deleteAdminFloodArea,
} = require("../controllers/admin-flood-area.controller");

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

router.get("/", listAdminFloodAreas);
router.get("/:areaId", getAdminFloodAreaDetail);
router.post("/", createAdminFloodArea);
router.patch("/:areaId", updateAdminFloodArea);
router.delete("/:areaId", deleteAdminFloodArea);

module.exports = router;