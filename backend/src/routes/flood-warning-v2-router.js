const express = require("express");
const jwt = require("jsonwebtoken");
const { warningError, documentId, noQuery, emptyBody } = require("../services/flood-warning-v2-contract");
const { getFloodWarningV2Service, READ_ROLES } = require("../services/flood-warning-v2.service");

function sendError(res, error) {
  if (error.isWarningV2Error === true) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
  console.error("[FloodWarningV2] INTERNAL_ERROR"); // No raw errors, bodies, or credentials.
  return res.status(500).json({ success: false, message: "Internal server error", code: "INTERNAL_ERROR" });
}
function createFloodWarningV2Router({ admin = false, devices = false, service, secret = () => process.env.JWT_SECRET } = {}) {
  const router = express.Router(), svc = () => service || getFloodWarningV2Service();
  router.use((req, res, next) => {
    try {
      const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i);
      if (!bearer) throw warningError("AUTH_REQUIRED", "Authentication token is required", 401);
      const signingSecret = secret();
      if (!signingSecret) throw new Error("JWT is not configured");
      let claims;
      try { claims = jwt.verify(bearer[1].trim(), signingSecret, { algorithms: ["HS256"] }); }
      catch { throw warningError("AUTH_REQUIRED", "Invalid or expired token", 401); }
      if (!claims || typeof claims !== "object" || !READ_ROLES.includes(claims.role)) throw warningError("AUTH_REQUIRED", "Invalid token claims", 401);
      req.warningActorId = documentId(claims.sub, "AUTH_REQUIRED", 401);
      next();
    } catch (error) { sendError(res, error); }
  });
  router.use(async (req, res, next) => {
    try { await svc().authorize(req.warningActorId, admin ? ["admin"] : devices ? ["resident"] : READ_ROLES); next(); }
    catch (error) { sendError(res, error); }
  });
  const handle = (operation, message) => async (req, res) => {
    try {
      const data = await operation(req);
      const status = req.method === "POST" && data.idempotency && !data.idempotency.replayed ? 201 : 200;
      res.status(status).json({ success: true, message, data });
    } catch (error) { sendError(res, error); }
  };
  const binding = (req) => ({ installationId: req.get("X-Installation-Id"), bindingId: req.get("X-Device-Binding-Id"), secret: req.get("X-Installation-Secret") });
  if (devices) {
    router.get("/:installationId", handle((req) => {
      noQuery(req.query); return svc().devices.installation(req.warningActorId, req.params.installationId, req.get("X-Installation-Secret"));
    }, "Installation state retrieved successfully"));
    router.put("/:installationId", handle((req) => {
      noQuery(req.query); return svc().devices.register(req.warningActorId, req.params.installationId, req.get("X-Installation-Secret"), req.body);
    }, "Device registration recorded successfully"));
    router.delete("/:installationId", handle((req) => {
      noQuery(req.query); emptyBody(req.body);
      return svc().devices.unregister(req.warningActorId, req.params.installationId, binding(req));
    }, "Device binding removed successfully"));
  } else {
    router.get("/", handle((req) => svc().list(req.warningActorId, req.query, admin), "Flood warnings retrieved successfully"));
    if (admin) {
      router.get("/summary", handle((req) => { noQuery(req.query); return svc().summary(req.warningActorId); }, "Flood warning summary retrieved successfully"));
      router.get("/creation-requests/:requestId", handle((req) => { noQuery(req.query); return svc().creationRequest(req.warningActorId, req.params.requestId); }, "Creation result retrieved successfully"));
      router.post("/", handle((req) => { noQuery(req.query); return svc().create(req.warningActorId, req.get("Idempotency-Key"), req.body); }, "Flood warning creation recorded successfully"));
      router.patch("/:alertId", handle((req) => { noQuery(req.query); return svc().update(req.warningActorId, req.params.alertId, req.body); }, "Flood warning updated successfully"));
      router.post("/:alertId/deactivate", handle((req) => { noQuery(req.query); return svc().deactivate(req.warningActorId, req.params.alertId, req.body); }, "Flood warning is inactive"));
    } else {
      router.get("/active", handle((req) => {
        if (req.query.status !== undefined && req.query.status !== "active") throw warningError("INVALID_ALERT_QUERY", "The active alias only supports active status", 400);
        return svc().list(req.warningActorId, { ...req.query, status: "active" });
      }, "Active flood warnings retrieved successfully"));
      router.get("/zones", handle((req) => { noQuery(req.query); return svc().zones(req.warningActorId); }, "Warning regions retrieved successfully"));
      router.put("/location", handle(async (req) => { await svc().authorize(req.warningActorId, ["resident"]); noQuery(req.query); return svc().devices.upload(req.warningActorId, binding(req), req.body); }, "Location sample recorded successfully"));
      router.get("/location-evaluation", handle(async (req) => { await svc().authorize(req.warningActorId, ["resident"]); noQuery(req.query); return svc().devices.evaluation(req.warningActorId, binding(req)); }, "Location evaluation retrieved successfully"));
      router.all(["/location", "/location-evaluation"], (req, res) => res.status(404).json({ success: false, message: "Endpoint not found", code: "ENDPOINT_NOT_FOUND" }));
    }
    router.get("/:alertId", handle((req) => { noQuery(req.query); return svc().detail(req.warningActorId, req.params.alertId, admin); }, "Flood warning retrieved successfully"));
  }
  router.use((req, res) => res.status(404).json({ success: false, message: "Endpoint not found", code: "ENDPOINT_NOT_FOUND" }));
  router.use((error, req, res, next) => {
    if (["entity.parse.failed", "entity.too.large"].includes(error.type)) return sendError(res, warningError("INVALID_ALERT_DATA", "Invalid JSON body or body too large", 400));
    return sendError(res, error);
  });
  return router;
}
// express.json() runs before route dispatch; parse errors therefore need an app-level handler.
function warningV2BodyErrorHandler(error, req, res, next) {
  if (/^\/api\/(?:(?:admin\/)?flood-alerts|notification-devices)(?:\/|$)/.test(req.path) &&
      ["entity.parse.failed", "entity.too.large"].includes(error.type)) {
    return sendError(res, warningError(req.path.startsWith("/api/notification-devices") ? "INVALID_DEVICE_DATA" : "INVALID_ALERT_DATA", "Invalid JSON body or body too large", 400));
  }
  return next(error);
}
module.exports = { createFloodWarningV2Router, warningV2BodyErrorHandler };
