package com.example.floodguard.ui.screens.sos

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun ResidentSosEventHistory(
    state: ResidentSosEventHistoryState
) {
    if (!state.isEnabled) return

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color(0xFF102638),
        shape = MaterialTheme.shapes.large
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "LỊCH SỬ SỰ KIỆN SOS",
                color = Color(0xFF20D7FF),
                fontWeight = FontWeight.Bold
            )

            if (state.isLoading) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = Color(0xFF20D7FF)
                )

                Text(
                    "Đang tải lịch sử sự kiện…",
                    color = Color(0xFF91A9B9)
                )
            }

            state.error?.let { message ->
                Text(message, color = Color(0xFFFFB4AB))

                if (state.hasLoaded) {
                    Text(
                        "Lịch sử bên dưới là dữ liệu từ lần tải thành công trước.",
                        color = Color(0xFF91A9B9)
                    )
                }
            }

            if (
                state.hasLoaded &&
                !state.isLoading &&
                state.error == null &&
                state.events.isEmpty()
            ) {
                Text(
                    "Hệ thống chưa cung cấp sự kiện lịch sử cho yêu cầu này.",
                    color = Color(0xFF91A9B9)
                )
            }

            state.events.forEachIndexed { index, event ->
                if (index > 0) {
                    HorizontalDivider(
                        color = Color(0xFF91A9B9).copy(alpha = 0.25f)
                    )
                }

                Text(
                    text = when (event.newStatus) {
                        "submitted" -> "Đã gửi — chờ cứu hộ"
                        "assisted" -> "Đã cứu"
                        null -> "Chưa có thông tin sự kiện"
                        else -> "Sự kiện trạng thái lưu trữ"
                    },
                    color = Color.White,
                    fontWeight = FontWeight.Medium
                )

                Text(
                    residentSosTime(event.changedAt)
                        ?: "Chưa có thông tin thời gian",
                    color = Color(0xFF91A9B9)
                )

                event.note?.takeIf { it.isNotBlank() }?.let {
                    Text(it, color = Color.White)
                }
            }

            Text(
                "Nguồn: lịch sử do Backend cung cấp • Giờ Việt Nam (GMT+7).",
                color = Color(0xFF91A9B9),
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}