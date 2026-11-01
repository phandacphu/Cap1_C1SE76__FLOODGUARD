
const TRANSPORT_NOT_CONFIGURED =
  "NOTIFICATION_TRANSPORT_NOT_CONFIGURED";

const TRANSPORT_SEND_FAILED =
  "NOTIFICATION_TRANSPORT_SEND_FAILED";

const TRANSPORT_TIMEOUT =
  "NOTIFICATION_TRANSPORT_TIMEOUT";

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

  if (
    typeof provider !== "object" ||
    typeof provider.send !== "function"
  ) {
    throw new Error("Invalid notification transport provider");
  }

  const timeoutMs =
    options?.timeoutMs ?? DEFAULT_TRANSPORT_TIMEOUT_MS;

  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000
  ) {
    throw new Error("Invalid notification transport timeout");
  }

  const controller = new AbortController();
  const timeoutMarker = Symbol("transport_timeout");

  let timeoutId;

  try {
    const sendPromise = Promise.resolve().then(() =>
      provider.send(notification, {
        signal: controller.signal,
      }),
    );

    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve(timeoutMarker);
      }, timeoutMs);
    });

    const result = await Promise.race([
      sendPromise,
      timeoutPromise,
    ]);

    if (result === timeoutMarker) {
      return {
        attempted: true,
        accepted: false,
        code: TRANSPORT_TIMEOUT,

        // The provider might have accepted the request.
        outcomeUnknown: true,
      };
    }

    return {
      attempted: true,
      accepted: true,
      providerMessageId:
        typeof result === "string" ? result : null,
    };
  } catch {
    // Never expose provider errors or credentials.
    return {
      attempted: true,
      accepted: false,
      code: TRANSPORT_SEND_FAILED,
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
