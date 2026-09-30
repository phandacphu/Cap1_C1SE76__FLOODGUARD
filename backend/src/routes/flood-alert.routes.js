const express = require("express");
const {
  listActiveFloodAlerts,
} = require("../controllers/flood-alert.controller");

const router = express.Router();

router.get("/active", listActiveFloodAlerts);

module.exports = router;