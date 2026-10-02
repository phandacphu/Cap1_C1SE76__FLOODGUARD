const express = require("express");

const {
  listSafeLocations,
} = require("../controllers/safe-location.controller");

const router = express.Router();

router.get("/", listSafeLocations);

module.exports = router;