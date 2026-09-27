const bcrypt = require("bcryptjs");
const { createUser, getUserByEmail } = require("../services/user.service");

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
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Public registration always creates Resident
    const user = await createUser({
      fullName: fullName.trim(),
      email,
      passwordHash,
      phone: phone || null,
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

module.exports = {
  register,
};
