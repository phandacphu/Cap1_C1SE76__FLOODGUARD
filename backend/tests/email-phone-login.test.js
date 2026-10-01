require("dotenv").config();

const assert = require("assert");
const {
  register,
  login,
} = require("../src/controllers/auth.controller");

function createResponse() {
  return {
    statusCode: null,
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
}

async function runTests() {
  const timestamp = Date.now();
  const phoneSuffix = timestamp
    .toString()
    .slice(-8)
    .padStart(8, "0");

  const email =
    `ccf243.test.${timestamp}@floodguard.local`;
  const duplicateEmail =
    `ccf243.duplicate.${timestamp}@floodguard.local`;
  const phone = `09${phoneSuffix}`;
  const normalizedPhone = `+849${phoneSuffix}`;
  const password = "Ccf243Test#123";

  const registerResponse = createResponse();

  await register(
    {
      body: {
        fullName: "CCF-243 Automated Test",
        email,
        phone,
        password,
      },
    },
    registerResponse,
  );

  assert.strictEqual(registerResponse.statusCode, 201);
  assert.strictEqual(registerResponse.body.success, true);
  assert.strictEqual(
    registerResponse.body.data.user.phone,
    normalizedPhone,
  );
  assert.strictEqual(
    registerResponse.body.data.user.role,
    "resident",
  );
  assert.strictEqual(
    registerResponse.body.data.user.passwordHash,
    undefined,
  );

  const phoneLoginResponse = createResponse();

  await login(
    {
      body: {
        identifier: phone,
        password,
      },
    },
    phoneLoginResponse,
  );

  assert.strictEqual(phoneLoginResponse.statusCode, 200);
  assert.strictEqual(phoneLoginResponse.body.success, true);
  assert.ok(phoneLoginResponse.body.data.token);
  assert.strictEqual(
    phoneLoginResponse.body.data.user.email,
    email,
  );
  assert.strictEqual(
    phoneLoginResponse.body.data.user.passwordHash,
    undefined,
  );

  const emailLoginResponse = createResponse();

  await login(
    {
      body: {
        email,
        password,
      },
    },
    emailLoginResponse,
  );

  assert.strictEqual(emailLoginResponse.statusCode, 200);
  assert.strictEqual(emailLoginResponse.body.success, true);
  assert.ok(emailLoginResponse.body.data.token);

  const duplicatePhoneResponse = createResponse();

  await register(
    {
      body: {
        fullName: "Duplicate Phone Test",
        email: duplicateEmail,
        phone: `+84${phone.slice(1)}`,
        password,
      },
    },
    duplicatePhoneResponse,
  );

  assert.strictEqual(
    duplicatePhoneResponse.statusCode,
    409,
  );
  assert.strictEqual(
    duplicatePhoneResponse.body.message,
    "Phone number already exists",
  );

  const invalidPhoneResponse = createResponse();

  await register(
    {
      body: {
        fullName: "Invalid Phone Test",
        email:
          `ccf243.invalid.${timestamp}@floodguard.local`,
        phone: "12345",
        password,
      },
    },
    invalidPhoneResponse,
  );

  assert.strictEqual(invalidPhoneResponse.statusCode, 400);
  assert.strictEqual(
    invalidPhoneResponse.body.message,
    "Invalid phone number format",
  );

  const wrongPasswordResponse = createResponse();

  await login(
    {
      body: {
        identifier: phone,
        password: "WrongPassword123",
      },
    },
    wrongPasswordResponse,
  );

  assert.strictEqual(wrongPasswordResponse.statusCode, 401);
  assert.strictEqual(
    wrongPasswordResponse.body.success,
    false,
  );

  const missingCredentialsResponse = createResponse();

  await login(
    {
      body: {
        identifier: "",
        password: "",
      },
    },
    missingCredentialsResponse,
  );

  assert.strictEqual(
    missingCredentialsResponse.statusCode,
    400,
  );
  assert.strictEqual(
    missingCredentialsResponse.body.success,
    false,
  );

  console.log("Email and phone login tests passed");
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Email and phone login tests failed");
    console.error(error);
    process.exit(1);
  });