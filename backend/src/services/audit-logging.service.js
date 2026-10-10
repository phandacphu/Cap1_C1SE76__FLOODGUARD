const {
  createAuditLog,
} = require("./audit-log.service");

const AUDIT_WRITE_TIMEOUT_MS = 5000;

function warnAuditFailure(code) {
  try {
    // Never print log input, credentials or raw error details.
    console.warn(`[Audit] ${code}`);
  } catch {
    // A console failure must not break the business operation.
  }
}

async function logAuditEvent(logData) {
  let timeoutId;

  try {
    const writePromise = Promise.resolve().then(
      () => createAuditLog(logData),
    );

    const timeoutPromise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error("Audit write timed out");
        error.code = "AUDIT_WRITE_TIMEOUT";
        reject(error);
      }, AUDIT_WRITE_TIMEOUT_MS);
    });

    const result = await Promise.race([
      writePromise,
      timeoutPromise,
    ]);

    return {
      success: true,
      id: result.id,
    };
  } catch (error) {
    let code = "AUDIT_WRITE_FAILED";

    if (error?.code === "INVALID_AUDIT_LOG_DATA") {
      code = "INVALID_AUDIT_LOG_DATA";
    } else if (error?.code === "AUDIT_WRITE_TIMEOUT") {
      code = "AUDIT_WRITE_TIMEOUT";
    }

    warnAuditFailure(code);

    return {
      success: false,
      code,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  AUDIT_WRITE_TIMEOUT_MS,
  logAuditEvent,
};