const {
  createUser,
  getUserById,
  getUserByEmail,
} = require("../src/services/user.service");

async function testUserService() {
  try {
    console.log("Creating test user...");

    const user = await createUser({
      fullName: "CCF32 Test User",
      email: "ccf32.test@floodguard.local",
      passwordHash: "test-hash-only",
      phone: "0123456789",
      role: "resident",
    });

    console.log("User created successfully");
    console.log("User ID:", user.id);

    const userById = await getUserById(user.id);

    console.log("Get user by ID successful");
    console.log("Email:", userById.email);

    const userByEmail = await getUserByEmail("ccf32.test@floodguard.local");

    console.log("Get user by email successful");
    console.log("Full name:", userByEmail.fullName);

    process.exit(0);
  } catch (error) {
    console.error("User service test failed");
    console.error(error);

    process.exit(1);
  }
}

testUserService();
