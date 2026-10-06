package com.example.floodguard.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.ui.graphics.vector.ImageVector

data class BottomNavItem(
    val label: String,
    val route: String,
    val icon: ImageVector
)

val floodGuardBottomItems = listOf(

    BottomNavItem(
        label = "Tổng quan",
        route = AppRoutes.HOME,
        icon = Icons.Outlined.Home
    ),

    BottomNavItem(
        label = "Bản đồ",
        route = AppRoutes.MAP,
        icon = Icons.Outlined.Map
    ),

    BottomNavItem(
        label = "SOS",
        route = AppRoutes.SEND_SOS,
        icon = Icons.Outlined.Warning
    ),

    BottomNavItem(
        label = "Tránh trú",
        route = AppRoutes.SAFE_LOCATION,
        icon = Icons.Outlined.Place
    ),

    BottomNavItem(
        label = "Cá nhân",
        route = AppRoutes.PROFILE,
        icon = Icons.Outlined.Person
    )
)