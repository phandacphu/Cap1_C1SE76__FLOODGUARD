const express = require("express");

const {
  listAdminUsers,
  getAdminUserDetail,
  updateAdminUser,
} = require("../controllers/admin-user.controller");

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

router.get("/", listAdminUsers);

router.get("/:userId", getAdminUserDetail);

router.patch("/:userId", updateAdminUser);

module.exports = router;