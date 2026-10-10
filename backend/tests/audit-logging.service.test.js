const assert = require("node:assert/strict");

let writeImplementation;
let writeCount = 0;

const auditDataPath = require.resolve(
  "../src/services/audit-log.service",
);

// Replace the write helper for isolated service tests.
// No Firebase connection or real database writes are made.
require.cache[auditDataPath] = {
  id: auditDataPath,
  filename: auditDataPath,
  loaded: true,
  exports: {
    createAuditLog(data) {
      writeCount++;
      return writeImplementation(data);
    },
  },
};

const {
  AUDIT_WRITE_TIMEOUT_MS,
  logAuditEvent,
} = require("../src/services/audit-logging.service");

function validEvent() {
  return {
    actor: {
      id: "admin-1",
      role: "admin",
    },
    action: "user.update",
    target: {
      type: "user",
      id: "user-1",
    },
    metadata: {
      source: "api",
      outcome: "success",
      changedFields: ["isActive"],
    },
  };
}

async function runTests() {
  const originalWarn = console.warn;
  const warnings = [];
  const unhandledRejections = [];

  const onUnhandledRejection = (error) => {
    unhandledRejections.push(error);
  };

  console.warn = (...args) => {
    warnings.push(args);
  };

  process.on(
    "unhandledRejection",
    onUnhandledRejection,
  );

  try {
    assert.equal(AUDIT_WRITE_TIMEOUT_MS, 5000);

    // Successful writes return the created log ID.
    const event = validEvent();
    const eventBefore = structuredClone(event);

    writeImplementation = async (data) => {
      assert.deepEqual(data, eventBefore);
      return { id: "audit-1" };
    };

    const successful = await logAuditEvent(event);

    assert.deepEqual(successful, {
      success: true,
      id: "audit-1",
    });

    assert.deepEqual(event, eventBefore);
    assert.equal(warnings.length, 0);

    // Validation failures are returned without throwing.
    writeImplementation = async () => {
      const error = new Error(
        "Sensitive validation details must not be printed",
      );
      error.code = "INVALID_AUDIT_LOG_DATA";
      throw error;
    };

    assert.deepEqual(
      await logAuditEvent(validEvent()),
      {
        success: false,
        code: "INVALID_AUDIT_LOG_DATA",
      },
    );

    assert.deepEqual(warnings.pop(), [
      "[Audit] INVALID_AUDIT_LOG_DATA",
    ]);

    // Firestore failures must not expose the original error.
    const sensitiveMessage =
      "password=hidden token=hidden credential=hidden";

    writeImplementation = async () => {
      throw new Error(sensitiveMessage);
    };

    assert.deepEqual(
      await logAuditEvent(validEvent()),
      {
        success: false,
        code: "AUDIT_WRITE_FAILED",
      },
    );

    assert.deepEqual(warnings.pop(), [
      "[Audit] AUDIT_WRITE_FAILED",
    ]);

    // Synchronous throws are also contained.
    writeImplementation = () => {
      throw new Error(sensitiveMessage);
    };

    assert.deepEqual(
      await logAuditEvent(validEvent()),
      {
        success: false,
        code: "AUDIT_WRITE_FAILED",
      },
    );

    assert.deepEqual(warnings.pop(), [
      "[Audit] AUDIT_WRITE_FAILED",
    ]);

    // Even an unusual rejected value must not escape.
    writeImplementation = async () => {
      throw null;
    };

    assert.deepEqual(
      await logAuditEvent(validEvent()),
      {
        success: false,
        code: "AUDIT_WRITE_FAILED",
      },
    );

    assert.deepEqual(warnings.pop(), [
      "[Audit] AUDIT_WRITE_FAILED",
    ]);

    // Console failures must not break the calling operation.
    console.warn = () => {
      throw new Error("Simulated console failure");
    };

    writeImplementation = async () => {
      throw new Error(sensitiveMessage);
    };

    assert.deepEqual(
      await logAuditEvent(validEvent()),
      {
        success: false,
        code: "AUDIT_WRITE_FAILED",
      },
    );

    console.warn = (...args) => {
      warnings.push(args);
    };

    // Simulate a business operation that already succeeded.
    // Logging failure must not change its returned result.
    const businessState = {
      isActive: true,
    };

    async function updateBusinessState() {
      businessState.isActive = false;

      await logAuditEvent(validEvent());

      return {
        success: true,
        data: {
          isActive: businessState.isActive,
        },
      };
    }

    assert.deepEqual(
      await updateBusinessState(),
      {
        success: true,
        data: { isActive: false },
      },
    );

    assert.equal(businessState.isActive, false);
    assert.deepEqual(warnings.pop(), [
      "[Audit] AUDIT_WRITE_FAILED",
    ]);

    // A stalled write must time out, without automatic retry.
    let rejectLateWrite;

    writeImplementation = () =>
      new Promise((resolve, reject) => {
        rejectLateWrite = reject;
      });

    const writesBeforeTimeout = writeCount;

    const timedOut = await logAuditEvent(validEvent());

    assert.deepEqual(timedOut, {
      success: false,
      code: "AUDIT_WRITE_TIMEOUT",
    });

    assert.equal(
      writeCount,
      writesBeforeTimeout + 1,
      "A timed-out write must not be retried",
    );

    assert.deepEqual(warnings.pop(), [
      "[Audit] AUDIT_WRITE_TIMEOUT",
    ]);

    // The pending write can reject after the timeout.
    // Promise.race must still handle that late rejection.
    rejectLateWrite(new Error(sensitiveMessage));

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(unhandledRejections, []);
    assert.equal(warnings.length, 0);

    // The service must remain usable after a timeout.
    writeImplementation = async () => ({
      id: "audit-after-timeout",
    });

    assert.deepEqual(
      await logAuditEvent(validEvent()),
      {
        success: true,
        id: "audit-after-timeout",
      },
    );

    console.log("Audit logging service tests passed");
  } finally {
    console.warn = originalWarn;

    process.removeListener(
      "unhandledRejection",
      onUnhandledRejection,
    );
  }
}

runTests().catch((error) => {
  console.error("Audit logging service tests failed");
  console.error(error);
  process.exitCode = 1;
});