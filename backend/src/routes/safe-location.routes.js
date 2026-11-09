const express = require("express");
const {
  listSafeLocations,
  listNearbySafeLocations,
  getSafeLocation,
} = require("../controllers/safe-location.controller");
const router = express.Router();
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.get("/nearby", listNearbySafeLocations);
router.get("/", listSafeLocations);
router.get("/:locationId", getSafeLocation);
module.exports = router;
