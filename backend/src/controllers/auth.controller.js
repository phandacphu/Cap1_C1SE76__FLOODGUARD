const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  createUser,
  getUserByEmail,
  getUserByPhone,
  getUserById,
  normalizePhone,
} = require("../services/user.service");

async function register(req, res) {
  try {
    const { fullName, email, password, phone } = req.body;

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email and password are required",
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Basic password validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // Check duplicate email
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await getUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

let normalizedPhone = null;

if (phone !== undefined && phone !== null && phone !== "") {
  try {
    normalizedPhone = normalizePhone(phone);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid phone number format",
    });
  }

  const existingPhoneUser =
    await getUserByPhone(normalizedPhone);

  if (existingPhoneUser) {
    return res.status(409).json({
      success: false,
      message: "Phone number already exists",
    });
  }
}

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Public registration always creates Resident
    const user = await createUser({
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash,
phone: normalizedPhone,
      role: "resident",
    });

    // Never return passwordHash
    const { passwordHash: _, ...safeUser } = user;

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: safeUser,
      },
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function login(req, res) {
  try {
    const { identifier, email, password } = req.body;
    const loginIdentifier = identifier ?? email;

    if (
      typeof loginIdentifier !== "string" ||
      !loginIdentifier.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Email or phone number and password are required",
      });
    }

    const normalizedIdentifier =
      loginIdentifier.trim().toLowerCase();
    const loginByPhone =
      !normalizedIdentifier.includes("@");

    let user;

    if (loginByPhone) {
      try {
        user = await getUserByPhone(normalizedIdentifier);
      } catch (error) {
        user = null;
      }
    } else {
      user = await getUserByEmail(normalizedIdentifier);
    }

    // Use one message to avoid revealing registered accounts
    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        message: "Invalid email, phone number or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email, phone number or password",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      },
    );

    const { passwordHash: _, ...safeUser } = user;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: safeUser,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function getProfile(req, res) {
  try {
    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
    }

    const { passwordHash: _, ...safeUser } = user;

    return res.status(200).json({
      success: true,
      message: "User profile retrieved successfully",
      data: {
        user: safeUser,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// Stateless JWT logout:
// The server does not store or blacklist access tokens.
// The client must remove its token after logout.
// Existing tokens become unusable when they expire.
function logout(req, res) {
  return res.status(200).json({
    success: true,
    message: "Logout successful",
  });
}

module.exports = {
  register,
  login,
  getProfile,
  logout,
};
