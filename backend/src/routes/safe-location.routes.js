const express = require("express");

const {
  listSafeLocations,
  listNearbySafeLocations,
} = require("../controllers/safe-location.controller");

const router = express.Router();

router.get("/nearby", listNearbySafeLocations);
router.get("/", listSafeLocations);

module.exports = router;