const assert = require("node:assert/strict");
const {
  authorizeRoles,
} = require("../src/middleware/rbac.middleware");

function executeMiddleware(middleware, user) {
  const req = {};

  if (user !== undefined) {
    req.user = user;
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

  middleware(req, res, () => {
    nextCalled = true;
  });

  return {
    req,
    res,
    nextCalled,
  };
}

function runTests() {
  assert.throws(
    () => authorizeRoles(),
    /At least one allowed role must be provided/,
  );

  const adminOnly = authorizeRoles("admin");

  const unauthenticatedResult = executeMiddleware(adminOnly);

  assert.equal(unauthenticatedResult.res.statusCode, 401);
  assert.equal(
    unauthenticatedResult.res.body.message,
    "Authentication is required",
  );
  assert.equal(unauthenticatedResult.nextCalled, false);

  const forbiddenResult = executeMiddleware(adminOnly, {
    id: "resident-user-id",
    role: "resident",
  });

  assert.equal(forbiddenResult.res.statusCode, 403);
  assert.equal(
    forbiddenResult.res.body.message,
    "You do not have permission to access this resource",
  );
  assert.equal(forbiddenResult.nextCalled, false);

  const allowedResult = executeMiddleware(adminOnly, {
    id: "admin-user-id",
    role: "admin",
  });

  assert.equal(allowedResult.res.statusCode, 200);
  assert.equal(allowedResult.nextCalled, true);

  const residentOrAdmin = authorizeRoles("resident", "admin");

  const multipleRolesResult = executeMiddleware(residentOrAdmin, {
    id: "resident-user-id",
    role: "resident",
  });

  assert.equal(multipleRolesResult.res.statusCode, 200);
  assert.equal(multipleRolesResult.nextCalled, true);

  console.log("Role-based access control middleware tests passed");
}

try {
  runTests();
  process.exit(0);
} catch (error) {
  console.error("Role-based access control middleware tests failed");
  console.error(error);
  process.exit(1);
}