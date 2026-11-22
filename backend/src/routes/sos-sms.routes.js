const express = require("express");
const { createHash, timingSafeEqual } = require("node:crypto");
const { authenticateToken } = require("../middleware/auth.middleware");
const { getUserById } = require("../services/user.service");
const { issueCredential } = require("../services/sos-sms-contract");
const { receiveSms } = require("../services/sos-sms.service");
const router = express.Router();
function enabled(req, res, next) {
  if (process.env.SOS_SMS_ENABLED !== "true") return res.status(503).json({ success: false, code: "SMS_DISABLED", message: "SMS intake is disabled" });
  next();
}
function gatewayAuth(req, res, next) {
  const key = process.env.SOS_SMS_GATEWAY_KEY;
  if (!key || Buffer.byteLength(key) < 32) return res.status(503).json({ success: false, code: "SMS_NOT_CONFIGURED" });
  const supplied = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
  const hash = v => createHash("sha256").update(v).digest();
  if (!timingSafeEqual(hash(supplied), hash(key))) return res.status(401).json({ success: false, code: "SMS_GATEWAY_UNAUTHORIZED" });
  next();
}
function errorResponse(res, error) {
  const status = error.statusCode ?? 500;
  return res.status(status).json({ success: false, code: status < 500 ? error.code : "SMS_UNAVAILABLE", message: status < 500 ? error.message : "SMS intake unavailable" });
}
router.post("/credential", enabled, authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user || user.role !== "resident" || user.isActive !== true) return res.status(403).json({ success: false, code: "SMS_RESIDENT_REQUIRED" });
    if (!/^\+?[0-9]{8,15}$/.test(process.env.SOS_SMS_RECIPIENT ?? "")) return res.status(503).json({ success: false, code: "SMS_NOT_CONFIGURED" });
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: { ...issueCredential(req.user.id), recipientPhone: process.env.SOS_SMS_RECIPIENT, format: "FGSOS1" } });
  } catch (error) { return errorResponse(res, error); }
});
router.post("/inbound", enabled, gatewayAuth, async (req, res) => {
  try { return res.json({ success: true, data: await receiveSms(req.body) }); }
  catch (error) { return errorResponse(res, error); }
});
module.exports = router;
