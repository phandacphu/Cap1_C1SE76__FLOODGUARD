package com.example.floodguard.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sos
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.floodguard.ui.navigation.AppRoutes

private val BottomBackground = Color(0xFF081522)
private val BottomBorder = Color(0xFF1D3547)
private val BottomGray = Color(0xFF8FA6B8)
private val BottomCyan = Color(0xFF20D7FF)
private val BottomRed = Color(0xFFE53935)
private val BottomRedText = Color(0xFFFF7373)

@Composable
fun FloodGuardBottomBar(
    currentRoute: String,
    onNavigate: (String) -> Unit
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(BottomBackground)
            .border(
                width = 1.dp,
                color = BottomBorder
            )
            .padding(
                horizontal = 6.dp,
                vertical = 7.dp
            ),

        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.Bottom
    ) {

        FloodGuardBottomItem(
            icon = Icons.Default.Home,
            title = "Tổng quan",
            selected = currentRoute == AppRoutes.HOME,
            onClick = {
                onNavigate(AppRoutes.HOME)
            }
        )

        FloodGuardBottomItem(
            icon = Icons.Default.Map,
            title = "Bản đồ",
            selected = currentRoute == AppRoutes.MAP,
            onClick = {
                onNavigate(AppRoutes.MAP)
            }
        )

        // =========================
        // SOS CENTER
        // =========================

        Column(
            modifier = Modifier.clickable {
                onNavigate(AppRoutes.SEND_SOS)
            },
            horizontalAlignment = Alignment.CenterHorizontally
        ) {

            Box(
                modifier = Modifier
                    .size(52.dp)
                    .background(
                        BottomRed,
                        CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {

                Icon(
                    imageVector = Icons.Default.Sos,
                    contentDescription = "SOS",
                    tint = Color.White,
                    modifier = Modifier.size(27.dp)
                )
            }

            Spacer(
                modifier = Modifier.height(2.dp)
            )

            Text(
                text = "Cứu hộ",
                color = BottomRedText,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold
            )
        }

        FloodGuardBottomItem(
            icon = Icons.Default.LocationOn,
            title = "Tránh trú",
            selected = currentRoute == AppRoutes.SAFE_LOCATION,
            onClick = {
                onNavigate(AppRoutes.SAFE_LOCATION)
            }
        )

        FloodGuardBottomItem(
            icon = Icons.Default.Settings,
            title = "Cài đặt",
            selected = currentRoute == AppRoutes.PROFILE,
            onClick = {
                onNavigate(AppRoutes.PROFILE)
            }
        )
    }
}

@Composable
private fun FloodGuardBottomItem(
    icon: ImageVector,
    title: String,
    selected: Boolean = false,
    onClick: () -> Unit
) {

    Column(
        modifier = Modifier
            .clickable {
                onClick()
            }
            .padding(5.dp),

        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        Icon(
            imageVector = icon,
            contentDescription = title,

            tint = if (selected) {
                BottomCyan
            } else {
                BottomGray
            },

            modifier = Modifier.size(21.dp)
        )

        Spacer(
            modifier = Modifier.height(3.dp)
        )

        Text(
            text = title,

            color = if (selected) {
                BottomCyan
            } else {
                BottomGray
            },

            fontSize = 9.sp,

            fontWeight = if (selected) {
                FontWeight.Bold
            } else {
                FontWeight.Normal
            }
        )
    }
}