const {
  classifyNotificationDeliveryError,
} = require("./notification-failure-policy.service");

const TRANSPORT_NOT_CONFIGURED = "NOTIFICATION_TRANSPORT_NOT_CONFIGURED";

const TRANSPORT_SEND_FAILED = "NOTIFICATION_TRANSPORT_SEND_FAILED";

const TRANSPORT_TIMEOUT = "NOTIFICATION_TRANSPORT_TIMEOUT";

const DEFAULT_TRANSPORT_TIMEOUT_MS = 10000;

async function sendNotificationViaTransport(
  notification,
  provider = null,
  options = {},
) {
  if (
    !notification ||
    typeof notification !== "object" ||
    Array.isArray(notification) ||
    typeof notification.id !== "string" ||
    !notification.id.trim()
  ) {
    throw new Error("Invalid notification for transport");
  }

  // Never send push without an explicitly configured provider.
  if (provider === null) {
    return {
      attempted: false,
      accepted: false,
      code: TRANSPORT_NOT_CONFIGURED,
    };
  }

  if (typeof provider !== "object" || typeof provider.send !== "function") {
    throw new Error("Invalid notification transport provider");
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TRANSPORT_TIMEOUT_MS;

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
    throw new Error("Invalid notification transport timeout");
  }

  const controller = new AbortController();
  const timeoutMarker = Symbol("transport_timeout");

  let timeoutId;
  let timedOut = false;

  function timeoutResult() {
    return {
      attempted: true,
      accepted: false,
      code: TRANSPORT_TIMEOUT,
      failureType: "unknown",
      retryable: false,
      providerResponseCode: TRANSPORT_TIMEOUT,
      outcomeUnknown: true,
    };
  }

  try {
    const sendPromise = Promise.resolve().then(() =>
      provider.send(notification, {
        signal: controller.signal,
      }),
    );

    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;

        // Settle the timeout before aborting the provider.
        // An abort rejection must not turn this into a retryable failure.
        resolve(timeoutMarker);
        controller.abort();
      }, timeoutMs);
    });

    const result = await Promise.race([sendPromise, timeoutPromise]);

    if (result === timeoutMarker || timedOut) {
      return timeoutResult();
    }

    return {
      attempted: true,
      accepted: true,
      providerMessageId: typeof result === "string" ? result : null,
    };
  } catch (error) {
    if (timedOut) {
      return timeoutResult();
    }

    // Return only fixed policy fields; never expose raw provider errors.
    const classification = classifyNotificationDeliveryError(error);

    return {
      attempted: true,
      accepted: false,
      code: TRANSPORT_SEND_FAILED,
      ...classification,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  TRANSPORT_NOT_CONFIGURED,
  TRANSPORT_SEND_FAILED,
  TRANSPORT_TIMEOUT,
  DEFAULT_TRANSPORT_TIMEOUT_MS,
  sendNotificationViaTransport,
};
