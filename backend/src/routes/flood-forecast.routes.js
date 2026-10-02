const express = require("express");
const {
  getFloodForecast,
} = require("../controllers/flood-forecast.controller");

const router = express.Router();

router.get("/", getFloodForecast);

module.exports = router;