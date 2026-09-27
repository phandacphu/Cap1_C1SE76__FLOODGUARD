const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authorizationHeader = req.headers.authorization;

  const bearerMatch =
    typeof authorizationHeader === "string"
      ? authorizationHeader.match(/^Bearer\s+(.+)$/i)
      : null;

  if (!bearerMatch) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
  }

  const token = bearerMatch[1].trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT authentication error: JWT_SECRET is not configured");

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (!decodedToken.sub || !decodedToken.role) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    req.user = {
      id: decodedToken.sub,
      role: decodedToken.role,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

module.exports = {
  authenticateToken,
};