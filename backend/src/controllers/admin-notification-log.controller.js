const {
  getNotificationLogsForAdmin,
} = require("../services/admin-notification-log.service");

async function listAdminNotificationLogs(req, res) {
  try {
    const result = await getNotificationLogsForAdmin(req.user.id, req.query);

    return res.status(200).json({
      success: true,
      message: "Notification delivery logs retrieved successfully",
      data: result,
    });
  } catch (error) {
    const expectedErrors = {
      INVALID_NOTIFICATION_LOG_QUERY: 400,
      NOTIFICATION_LOG_AUTH_REQUIRED: 401,
      NOTIFICATION_LOG_FORBIDDEN: 403,
    };

    if (Object.hasOwn(expectedErrors, error.code)) {
      return res.status(expectedErrors[error.code]).json({
        success: false,
        message: error.message,
      });
    }

    console.error("[AdminNotificationLog] LOOKUP_FAILED");

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

module.exports = {
  listAdminNotificationLogs,
};
