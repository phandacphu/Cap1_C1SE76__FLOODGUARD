const express = require("express");
const {
  listFloodAreas,
} = require("../controllers/flood-area.controller");

const router = express.Router();

router.get("/", listFloodAreas);

module.exports = router;