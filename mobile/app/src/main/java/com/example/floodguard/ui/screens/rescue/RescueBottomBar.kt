package com.example.floodguard.ui.screens.rescue

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Sos
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.floodguard.R

enum class RescueMainTab { OVERVIEW, MAP, SOS, TASKS }

/** Shared navigation for Rescue screens. Null callbacks mark unavailable modules. */
@Composable
fun RescueBottomBar(
    selectedTab: RescueMainTab,
    onOverview: () -> Unit,
    onMap: (() -> Unit)? = null,
    onSos: (() -> Unit)? = null,
    onTasks: (() -> Unit)? = null,
    isBusy: Boolean = false
) {
    val cyan = Color(0xFF8AEBFF)
    val muted = Color(0xFFBBC9CD)
    val font = FontFamily(Font(R.font.rescue_be_vietnam_regular))
    val tabs = listOf(
        Triple(RescueMainTab.OVERVIEW, "Tổng quan", Icons.Outlined.Dashboard),
        Triple(RescueMainTab.MAP, "Bản đồ", Icons.Outlined.Map),
        Triple(RescueMainTab.SOS, "SOS", Icons.Outlined.Sos),
        Triple(RescueMainTab.TASKS, "Nhiệm vụ", Icons.Outlined.History)
    )

    NavigationBar(
        containerColor = Color(0xFF0D1C2D),
        tonalElevation = 0.dp,
        windowInsets = WindowInsets(0, 0, 0, 0)
    ) {
        tabs.forEach { (tab, title, icon) ->
            val action = when (tab) {
                RescueMainTab.OVERVIEW -> onOverview
                RescueMainTab.MAP -> onMap
                RescueMainTab.SOS -> onSos
                RescueMainTab.TASKS -> onTasks
            }
            val selected = tab == selectedTab
            val available = selected || action != null

            NavigationBarItem(
                selected = selected,
                enabled = !isBusy && available,
                onClick = { action?.invoke() },
                icon = {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(22.dp)
                    )
                },
                label = {
                    Text(
                        text = if (available) title else "$title\nSắp có",
                        fontFamily = font,
                        fontSize = 10.sp,
                        color = if (selected) cyan else muted
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = cyan,
                    indicatorColor = Color(0xFF1C2B3C),
                    unselectedIconColor = muted,
                    disabledIconColor = muted.copy(alpha = 0.5f)
                )
            )
        }
    }
}
