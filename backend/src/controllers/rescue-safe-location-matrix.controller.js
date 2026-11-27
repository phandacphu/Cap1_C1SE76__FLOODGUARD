"use strict";

const {
  normalizeSafeLocationId,
} = require("../services/safe-location-contract");

const {
  normalizePoint,
} = require("../services/rescue-route-distance.service");

const {
  MAX_DESTINATIONS,
} = require("../services/rescue-route-matrix.service");

function createRescueSafeLocationMatrixController({
  findUser,
  findLocation,
  estimateBatch,
}) {
  return async function safeLocationMatrix(req, res) {
    try {
      res.set("Cache-Control", "no-store");

      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: "Authentication is required",
        });
      }

      const user = await findUser(req.user.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Account no longer exists",
        });
      }

      if (user.isActive !== true || user.role !== "rescue") {
        return res.status(403).json({
          success: false,
          message: "Active Rescue account required",
        });
      }

      const body = req.body;

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).sort().join(",") !== "locationIds,origin" ||
        !Array.isArray(body.locationIds) ||
        body.locationIds.length < 1 ||
        body.locationIds.length > MAX_DESTINATIONS
      ) {
        return res.status(400).json({
          success: false,
          code: "INVALID_MATRIX_REQUEST",
          message: "Valid safe location IDs and origin are required",
        });
      }

      const ids = body.locationIds.map(normalizeSafeLocationId);

      if (
        ids.some((id, index) => id !== body.locationIds[index]) ||
        new Set(ids).size !== ids.length
      ) {
        return res.status(400).json({
          success: false,
          code: "INVALID_MATRIX_REQUEST",
          message: "Safe location IDs must be unique and normalized",
        });
      }

      const origin = normalizePoint(body.origin, "origin");

      const records = await Promise.all(
        ids.map(async (id) => {
          try {
            return await findLocation(id);
          } catch (error) {
            if (error.code === "SAFE_LOCATION_NOT_FOUND") {
              return null;
            }
            throw error;
          }
        }),
      );

      const destinations = [];
      const points = new Map();

      for (let i = 0; i < ids.length; i++) {
        const record = records[i];

        if (!record || record.id !== ids[i]) continue;

        let destination;
        try {
          destination = normalizePoint(
            record.location,
            "destination",
          );
        } catch (_) {
          continue;
        }

        const requestId = `safe-location:${ids[i]}`;

        destinations.push({
          requestId,
          destination,
        });

        points.set(ids[i], destination);
      }

      const batch = destinations.length
        ? await estimateBatch({
            origin,
            destinations,
            rescueId: req.user.id,
          })
        : { results: [] };

      const found = new Map(
        batch.results.map((row) => [
          row.requestId,
          row.distanceMeters,
        ]),
      );

      return res.status(200).json({
        success: true,
        data: {
          provider: "openrouteservice",
          travelMode: "DRIVE",
          results: ids.map((locationId) => {
            const meters = found.get(
              `safe-location:${locationId}`,
            );

            return {
              locationId,
              destination: points.get(locationId) || null,
              distanceMeters:
                Number.isSafeInteger(meters) && meters >= 0
                  ? meters
                  : null,
            };
          }),
        },
      });
    } catch (error) {
      const status =
        Number.isInteger(error.statusCode) &&
        error.statusCode >= 400 &&
        error.statusCode <= 504
          ? error.statusCode
          : 500;

      return res.status(status).json({
        success: false,
        code:
          status === 500
            ? "ROUTE_INTERNAL_ERROR"
            : error.code,
        message:
          status === 500
            ? "Internal server error"
            : error.message,
      });
    }
  };
}

module.exports = {
  createRescueSafeLocationMatrixController,
};