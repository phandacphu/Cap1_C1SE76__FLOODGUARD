const {
  listUsersForAdmin,
  getUserDetailForAdmin,
  updateUserForAdmin,
} = require("../services/admin-user.service");

function hasAuthenticatedUser(req, res) {
  if (
    !req.user ||
    typeof req.user.id !== "string" ||
    !req.user.id.trim()
  ) {
    res.status(401).json({
      success: false,
      message: "Authentication is required",
    });

    return false;
  }

  return true;
}

function handleAdminUserError(res, error) {
  const errorStatuses = {
    INVALID_ADMIN_USER_ID: 400,
    INVALID_ADMIN_USER_UPDATE: 400,
    ADMIN_USER_AUTH_REQUIRED: 401,
    ADMIN_USER_ACCOUNT_INACTIVE: 403,
    ADMIN_USER_ROLE_FORBIDDEN: 403,
    ADMIN_USER_SELF_UPDATE_FORBIDDEN: 403,
    ADMIN_USER_NOT_FOUND: 404,
  };

  const statusCode = errorStatuses[error.code];

  if (statusCode) {
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }

  // Avoid printing user records or request bodies.
  console.error("Admin user operation failed");

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

async function listAdminUsers(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) {
      return;
    }

    const users = await listUsersForAdmin(req.user.id);

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: {
        users,
      },
    });
  } catch (error) {
    return handleAdminUserError(res, error);
  }
}

async function getAdminUserDetail(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) {
      return;
    }

    const user = await getUserDetailForAdmin(
      req.user.id,
      req.params.userId,
    );

    return res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    return handleAdminUserError(res, error);
  }
}

async function updateAdminUser(req, res) {
  try {
    if (!hasAuthenticatedUser(req, res)) {
      return;
    }

    const user = await updateUserForAdmin(
      req.user.id,
      req.params.userId,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    return handleAdminUserError(res, error);
  }
}

module.exports = {
  listAdminUsers,
  getAdminUserDetail,
  updateAdminUser,
};