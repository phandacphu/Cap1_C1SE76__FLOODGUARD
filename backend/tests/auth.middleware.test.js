require("dotenv").config();

const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
  authenticateToken,
} = require("../src/middleware/auth.middleware");

function executeMiddleware(authorizationHeader) {
  const req = {
    headers: {},
  };

  if (authorizationHeader !== undefined) {
    req.headers.authorization = authorizationHeader;
  }

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  return {
    req,
    res,
    nextCalled,
  };
}

function runTests() {
  assert.ok(
    process.env.JWT_SECRET,
    "JWT_SECRET must be configured before running this test",
  );

  const missingTokenResult = executeMiddleware();

  assert.equal(missingTokenResult.res.statusCode, 401);
  assert.equal(
    missingTokenResult.res.body.message,
    "Authentication token is required",
  );
  assert.equal(missingTokenResult.nextCalled, false);

  const invalidTokenResult = executeMiddleware(
    "Bearer invalid-token",
  );

  assert.equal(invalidTokenResult.res.statusCode, 401);
  assert.equal(
    invalidTokenResult.res.body.message,
    "Invalid or expired token",
  );
  assert.equal(invalidTokenResult.nextCalled, false);

  const expiredToken = jwt.sign(
    {
      sub: "test-user-id",
      role: "resident",
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: -1,
    },
  );

  const expiredTokenResult = executeMiddleware(
    `Bearer ${expiredToken}`,
  );

  assert.equal(expiredTokenResult.res.statusCode, 401);
  assert.equal(
    expiredTokenResult.res.body.message,
    "Invalid or expired token",
  );
  assert.equal(expiredTokenResult.nextCalled, false);

  const validToken = jwt.sign(
    {
      sub: "test-user-id",
      role: "resident",
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "5m",
    },
  );

  const validTokenResult = executeMiddleware(
    `Bearer ${validToken}`,
  );

  assert.equal(validTokenResult.nextCalled, true);
  assert.deepEqual(validTokenResult.req.user, {
    id: "test-user-id",
    role: "resident",
  });

  console.log("JWT authentication middleware tests passed");
}

try {
  runTests();
  process.exit(0);
} catch (error) {
  console.error("JWT authentication middleware tests failed");
  console.error(error);
  process.exit(1);
}