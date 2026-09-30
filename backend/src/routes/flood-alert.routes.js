const express = require("express");
const {
  listActiveFloodAlerts,
  listFloodAlerts,
} = require("../controllers/flood-alert.controller");

const router = express.Router();

router.get("/", listFloodAlerts);
router.get("/active", listActiveFloodAlerts);

module.exports = router;