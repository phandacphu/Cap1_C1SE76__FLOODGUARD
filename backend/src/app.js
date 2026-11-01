const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();

const authRoutes = require("./routes/auth.routes");
const floodAreaRoutes = require("./routes/flood-area.routes");
const floodHistoryRoutes = require("./routes/flood-history.routes");
const floodAlertRoutes = require("./routes/flood-alert.routes");
const safeLocationRoutes = require("./routes/safe-location.routes");
const floodForecastRoutes = require("./routes/flood-forecast.routes");
const rescueRequestRoutes = require("./routes/rescue-request.routes");
const adminUserRoutes = require("./routes/admin-user.routes");
const adminFloodAreaRoutes = require("./routes/admin-flood-area.routes");
const adminFloodAlertRoutes = require("./routes/admin-flood-alert.routes");
const adminSafeLocationRoutes = require("./routes/admin-safe-location.routes");
const adminSosMonitoringRoutes = require("./routes/admin-sos-monitoring.routes");
const floodWarningSubscriptionRoutes = require("./routes/flood-warning-subscription.routes");

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "FLOODGUARD API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/flood-areas", floodAreaRoutes);
app.use("/api/flood-history", floodHistoryRoutes);
app.use("/api/flood-alerts", floodAlertRoutes);
app.use("/api/flood-forecast", floodForecastRoutes);
app.use("/api/safe-locations", safeLocationRoutes);
app.use("/api/rescue-requests", rescueRequestRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/flood-areas", adminFloodAreaRoutes);
app.use("/api/admin/flood-alerts", adminFloodAlertRoutes);
app.use("/api/admin/safe-locations", adminSafeLocationRoutes);
app.use("/api/admin/rescue-requests", adminSosMonitoringRoutes);
app.use("/api/flood-warning-subscriptions", floodWarningSubscriptionRoutes);
module.exports = app;
