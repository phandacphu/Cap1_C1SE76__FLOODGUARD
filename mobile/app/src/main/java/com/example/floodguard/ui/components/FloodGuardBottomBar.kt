package com.example.floodguard.ui.components

import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

import com.example.floodguard.ui.navigation.floodGuardBottomItems

@Composable
fun FloodGuardBottomBar(
    currentRoute: String,
    onNavigate: (String) -> Unit
) {

    NavigationBar(
        containerColor = Color(0xFF08111F)
    ) {

        floodGuardBottomItems.forEach { item ->

            val selected =
                currentRoute == item.route

            NavigationBarItem(

                selected = selected,

                onClick = {
                    onNavigate(item.route)
                },

                icon = {

                    Icon(
                        imageVector = item.icon,
                        contentDescription = item.label
                    )
                },

                label = {

                    Text(
                        text = item.label
                    )
                },

                colors =
                    NavigationBarItemDefaults.colors(

                        selectedIconColor =
                            Color(0xFF22D3EE),

                        selectedTextColor =
                            Color(0xFF22D3EE),

                        indicatorColor =
                            Color(0xFF164E63),

                        unselectedIconColor =
                            Color(0xFF64748B),

                        unselectedTextColor =
                            Color(0xFF64748B)
                    )
            )
        }
    }
}