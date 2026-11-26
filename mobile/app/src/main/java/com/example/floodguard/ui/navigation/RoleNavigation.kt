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
    route == AppRoutes.RESCUE_HOME ||
            route == AppRoutes.RESCUE_PROFILE ||
            route == AppRoutes.RESCUE_MAP ||
            route == AppRoutes.RESCUE_SOS ||
            route?.startsWith("${AppRoutes.RESCUE_SOS_DETAIL}/") == true ||
            route == AppRoutes.RESCUE_SAFE_LOCATIONS ||
            route?.startsWith("${AppRoutes.RESCUE_SAFE_LOCATION_DETAIL}/") == true ||
            route == AppRoutes.RESCUE_FLOOD_WARNINGS ||
            route == AppRoutes.RESCUE_FLOOD_WARNING_MAP ||
            route?.startsWith("${AppRoutes.RESCUE_FLOOD_WARNING_DETAIL}/") == true
