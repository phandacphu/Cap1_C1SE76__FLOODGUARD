"use strict";

const { validDocumentId } = require("../services/sos-contract");
const { normalizePoint } = require("../services/rescue-route-distance.service");
const { MAX_DESTINATIONS } = require("../services/rescue-route-matrix.service");

function createRescueRouteMatrixController({ findUser, findRequest, estimateBatch }) {
  if (typeof findUser !== "function" || typeof findRequest !== "function" ||
      typeof estimateBatch !== "function") throw new Error("Missing matrix dependencies");
  return async function routeMatrix(req, res) {
    try {
      if (!req.user?.id) return res.status(401).json({ success: false, message: "Authentication is required" });
      const user = await findUser(req.user.id);
      if (!user) return res.status(401).json({ success: false, message: "Account no longer exists" });
      if (user.isActive !== true || user.role !== "rescue") {
        return res.status(403).json({ success: false, message: "Active Rescue account required" });
      }
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).sort().join(",") !== "origin,requestIds" ||
          !Array.isArray(body.requestIds) || body.requestIds.length < 1 ||
          body.requestIds.length > MAX_DESTINATIONS ||
          body.requestIds.some((id) => typeof id !== "string" || !validDocumentId(id) || id !== id.trim()) ||
          new Set(body.requestIds).size !== body.requestIds.length) {
        return res.status(400).json({ success: false, code: "INVALID_MATRIX_REQUEST",
          message: "A nonempty, unique SOS ID list and origin are required" });
      }
      const origin = normalizePoint(body.origin, "origin");
      // Destinations are looked up from trusted Firestore documents; never supplied by caller.
      const requests = await Promise.all(body.requestIds.map((id) => findRequest(id)));
      const destinations = [];
      for (let i = 0; i < requests.length; i++) {
        if (!requests[i]) continue;
        try {
          destinations.push({ requestId: body.requestIds[i],
            destination: normalizePoint(requests[i].location, "destination") });
        } catch (_) { /* Keep unavailable SOS at the end; never synthesize a straight-line distance. */ }
      }
      const batch = await estimateBatch({ origin, destinations, rescueId: req.user.id });
      const found = new Map(batch.results.map((row) => [row.requestId, row.distanceMeters]));
      const authoritativePoints = new Map(destinations.map((row) => [row.requestId, row.destination]));
      return res.status(200).json({ success: true, data: {
        provider: "openrouteservice", travelMode: "DRIVE",
        results: body.requestIds.map((requestId) => ({ requestId,
          distanceMeters: found.has(requestId) ? found.get(requestId) : null,
          // The exact SOS coordinate supplied to Matrix, not one from caller's body.
          destination: authoritativePoints.get(requestId) || null })),
      } });
    } catch (error) {
      const status = Number.isInteger(error.statusCode) && error.statusCode >= 400 &&
        error.statusCode <= 504 ? error.statusCode : 500;
      return res.status(status).json({ success: false,
        code: status === 500 ? "ROUTE_INTERNAL_ERROR" : error.code,
        message: status === 500 ? "Internal server error" : error.message });
    }
  };
}

module.exports = { createRescueRouteMatrixController };
