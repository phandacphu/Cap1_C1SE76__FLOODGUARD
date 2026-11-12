"use strict";

const { validDocumentId } = require("../services/sos-contract");
const { normalizePoint } = require("../services/rescue-route-distance.service");

function createRescueRouteDistanceController({ findUser, findRequest, estimate }) {
  if (typeof findUser !== "function" || typeof findRequest !== "function" ||
      typeof estimate !== "function") throw new Error("Missing route distance dependencies");

  return async function routeDistance(req, res) {
    try {
      if (!req.user?.id) return res.status(401).json({ success: false, message: "Authentication is required" });
      const user = await findUser(req.user.id);
      if (!user) return res.status(401).json({ success: false, message: "Account no longer exists" });
      if (user.isActive !== true || user.role !== "rescue") {
        return res.status(403).json({ success: false, message: "Active Rescue account required" });
      }

      const input = req.body;
      if (!input || typeof input !== "object" || Array.isArray(input) ||
          Object.keys(input).sort().join(",") !== "origin,requestId" ||
          !validDocumentId(input.requestId) || input.requestId !== input.requestId.trim()) {
        return res.status(400).json({ success: false, code: "INVALID_ROUTE_REQUEST", message: "requestId and origin are required" });
      }
      const origin = normalizePoint(input.origin, "origin");
      const request = await findRequest(input.requestId);
      if (!request) return res.status(404).json({ success: false, code: "SOS_NOT_FOUND", message: "SOS not found" });
      let destination;
      try {
        destination = normalizePoint(request.location, "destination");
      } catch (_) {
        return res.status(422).json({ success: false, code: "SOS_LOCATION_UNAVAILABLE", message: "SOS location unavailable" });
      }
      const result = await estimate({ origin, destination, requestId: input.requestId, rescueId: req.user.id });
      return res.status(200).json({ success: true, data: { ...result, requestId: input.requestId, destination } });
    } catch (error) {
      const status = Number.isInteger(error.statusCode) && error.statusCode >= 400 &&
        error.statusCode <= 504 ? error.statusCode : 500;
      return res.status(status).json({ success: false,
        code: status === 500 ? "ROUTE_INTERNAL_ERROR" : error.code,
        message: status === 500 ? "Internal server error" : error.message });
    }
  };
}

module.exports = { createRescueRouteDistanceController };
