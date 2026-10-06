const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();

const authRoutes = require("./routes/auth.routes");
const floodAreaRoutes = require("./routes/flood-area.routes");
const floodAlertRoutes = require("./routes/flood-alert.routes");
const safeLocationRoutes = require(
  "./routes/safe-location.routes",
);
const floodForecastRoutes = require(
  "./routes/flood-forecast.routes",
);
const rescueRequestRoutes = require(
  "./routes/rescue-request.routes",
);

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
app.use("/api/flood-alerts", floodAlertRoutes);
app.use("/api/flood-forecast", floodForecastRoutes);
app.use("/api/safe-locations", safeLocationRoutes);
app.use("/api/rescue-requests", rescueRequestRoutes);

module.exports = app;