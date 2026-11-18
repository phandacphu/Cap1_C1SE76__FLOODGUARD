package com.example.floodguard.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.floodguard.domain.model.SafeLocation
import java.util.Locale

@Suppress("UNUSED_PARAMETER")
@Composable
fun SafeLocationCard(
    location: SafeLocation,
    onViewDetail: (String) -> Unit = {},
    onDirections: (SafeLocation) -> Unit = {}
) {
    val typeLabel = when (location.type) {
        "shelter" -> "Điểm tránh trú"
        "school" -> "Trường học"
        "hospital" -> "Bệnh viện"
        "community_center" -> "Nhà sinh hoạt cộng đồng"
        else -> "Khác"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onViewDetail(location.id) },
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF132738)
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(typeLabel, color = Color(0xFF39D9E8), fontSize = 13.sp)
            Text(
                text = location.name,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
            )
            Text(location.address, color = Color(0xFF9CAFC0))

            location.distanceKm?.let { distanceKm ->
                Text(
                    text = String.format(
                        Locale.forLanguageTag("vi-VN"),
                        "Cách bạn khoảng %.2f km",
                        distanceKm
                    ),
                    color = Color(0xFF39D9E8)
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { onViewDetail(location.id) }) {
                    Text("Xem chi tiết", color = Color(0xFF39D9E8))
                }

                if (
                    location.latitude in -90.0..90.0 &&
                    location.longitude in -180.0..180.0
                ) {
                    TextButton(onClick = { onDirections(location) }) {
                        Text("Mở Google Maps", color = Color(0xFF39D9E8))
                    }
                }
            }
        }
    }
}