package com.example.floodguard.ui.navigation

internal data class NavigationSession(
    val isLoggedIn: Boolean = false,
    val role: String? = null,
    val accountKey: String? = null
)

internal fun homeRouteForRole(role: String?): String =
    when (role) {
        "resident" -> AppRoutes.HOME
        "rescue" -> AppRoutes.RESCUE_HOME
        else -> AppRoutes.ACCESS_DENIED
    }

internal fun isRescueRoute(route: String?): Boolean =
    route == AppRoutes.RESCUE_HOME || route == AppRoutes.RESCUE_MAP ||
        route == AppRoutes.RESCUE_SOS || route?.startsWith("${AppRoutes.RESCUE_SOS_DETAIL}/") == true
