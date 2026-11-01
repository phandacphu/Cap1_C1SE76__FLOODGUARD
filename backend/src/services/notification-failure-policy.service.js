function transient(providerResponseCode) {
  return {
    failureType: "transient",
    retryable: true,
    outcomeUnknown: false,
    providerResponseCode,
  };
}

function permanent(providerResponseCode) {
  return {
    failureType: "permanent",
    retryable: false,
    outcomeUnknown: false,
    providerResponseCode,
  };
}

function unknown(providerResponseCode) {
  return {
    failureType: "unknown",
    retryable: false,
    outcomeUnknown: true,
    providerResponseCode,
  };
}

function classifyNotificationDeliveryError(error) {
  const source = error && typeof error === "object" ? error : {};

  // Internal provider adapter contract.
  // This means an invalid notification destination token, not a JWT.
  if (source.code === "INVALID_DEVICE_TOKEN") {
    return permanent("PROVIDER_INVALID_TOKEN");
  }

  if (["ETIMEDOUT", "ECONNRESET", "EPIPE", "ABORT_ERR"].includes(source.code)) {
    return unknown("NOTIFICATION_OUTCOME_UNKNOWN");
  }

  const statusCode = [
    source.statusCode,
    source.status,
    source.response?.status,
  ].find((value) => Number.isInteger(value) && value >= 100 && value <= 599);

  if (statusCode === 408 || statusCode === 504) {
    return unknown("NOTIFICATION_OUTCOME_UNKNOWN");
  }

  if (statusCode === 429) {
    return transient("PROVIDER_RATE_LIMITED");
  }

  if (statusCode >= 500 && statusCode <= 599) {
    return transient("PROVIDER_SERVER_ERROR");
  }

  if (statusCode >= 400 && statusCode <= 499) {
    return permanent("PROVIDER_REJECTED");
  }

  // Preserve the existing provider contract:
  // an ordinary rejection means the send failed.
  // Adapters must explicitly identify ambiguous network outcomes above.
  return transient("NOTIFICATION_TRANSPORT_SEND_FAILED");
}

module.exports = {
  classifyNotificationDeliveryError,
};
