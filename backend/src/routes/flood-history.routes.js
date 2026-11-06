const express = require("express");

const {
  listHistoricalFloodPoints,
  listHistoricalFloodBuffers,
  listHistoricalFloodRadar,
} = require("../controllers/flood-history.controller");

const router = express.Router();

// Historical reported flood points
router.get("/points", listHistoricalFloodPoints);

// Historical reference buffers (220m and 450m)
router.get("/buffers", listHistoricalFloodBuffers);

// Historical radar-derived candidate areas
router.get("/radar", listHistoricalFloodRadar);

module.exports = router;
