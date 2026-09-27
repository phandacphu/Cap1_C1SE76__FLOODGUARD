require("dotenv").config();

const assert = require("assert");
const jwt = require("jsonwebtoken");
const {
  authenticateToken,
} = require("../src/middleware/auth.middleware");
const {
  logout,
} = require("../src/controllers/auth.controller");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function testLogout() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required for logout tests");
  }

  // Missing token
  const missingTokenRequest = {
    headers: {},
  };
  const missingTokenResponse = createResponse();
  let missingTokenNextCalled = false;

  authenticateToken(
    missingTokenRequest,
    missingTokenResponse,
    () => {
      missingTokenNextCalled = true;
    },
  );

  assert.strictEqual(missingTokenNextCalled, false);
  assert.strictEqual(missingTokenResponse.statusCode, 401);
  assert.strictEqual(
    missingTokenResponse.body.message,
    "Authentication token is required",
  );

  // Valid token
  const validToken = jwt.sign(
    {
      sub: "logout-test-user",
      role: "resident",
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "5m",
    },
  );

  const validTokenRequest = {
    headers: {
      authorization: `Bearer ${validToken}`,
    },
  };
  const validTokenResponse = createResponse();
  let validTokenNextCalled = false;

  authenticateToken(
    validTokenRequest,
    validTokenResponse,
    () => {
      validTokenNextCalled = true;
    },
  );

  assert.strictEqual(validTokenNextCalled, true);
  assert.strictEqual(validTokenRequest.user.id, "logout-test-user");
  assert.strictEqual(validTokenRequest.user.role, "resident");

  logout(validTokenRequest, validTokenResponse);

  assert.strictEqual(validTokenResponse.statusCode, 200);
  assert.strictEqual(validTokenResponse.body.success, true);
  assert.strictEqual(
    validTokenResponse.body.message,
    "Logout successful",
  );

  // Expired token
  const expiredToken = jwt.sign(
    {
      sub: "logout-test-user",
      role: "resident",
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: -1,
    },
  );

  const expiredTokenRequest = {
    headers: {
      authorization: `Bearer ${expiredToken}`,
    },
  };
  const expiredTokenResponse = createResponse();
  let expiredTokenNextCalled = false;

  authenticateToken(
    expiredTokenRequest,
    expiredTokenResponse,
    () => {
      expiredTokenNextCalled = true;
    },
  );

  assert.strictEqual(expiredTokenNextCalled, false);
  assert.strictEqual(expiredTokenResponse.statusCode, 401);
  assert.strictEqual(
    expiredTokenResponse.body.message,
    "Invalid or expired token",
  );

  console.log("Logout and session handling tests passed");
}

testLogout();