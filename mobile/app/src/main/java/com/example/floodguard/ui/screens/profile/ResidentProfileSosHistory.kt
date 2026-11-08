package com.example.floodguard.ui.screens.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.floodguard.ui.screens.sos.residentSosStateLabel
import com.example.floodguard.ui.screens.sos.residentSosTime

@Composable
fun ResidentProfileSosHistory(
    state: ProfileSosUiState,
    onRefresh: () -> Unit,
    onOpenDetail: (String) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color(0xFF102638),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "Yêu cầu và lịch sử SOS",
                color = Color.White,
                fontWeight = FontWeight.Bold
            )

            OutlinedButton(
                onClick = onRefresh,
                enabled = !state.isLoading,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    if (state.error == null) "Làm mới" else "Thử lại",
                    color = Color(0xFF20D7FF)
                )
            }

            if (state.isLoading) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = Color(0xFF20D7FF)
                )
                Text(
                    "Đang tải danh sách SOS…",
                    color = Color(0xFF91A9B9)
                )
            }

            state.error?.let { message ->
                Text(message, color = Color(0xFFFFB4AB))

                if (state.requests.isNotEmpty()) {
                    Text(
                        "Đang hiển thị dữ liệu từ lần tải thành công trước.",
                        color = Color(0xFF91A9B9)
                    )
                }
            }

            if (
                !state.isLoading &&
                state.error == null &&
                state.requests.isEmpty()
            ) {
                Text(
                    "Bạn chưa có yêu cầu SOS nào.",
                    color = Color(0xFF91A9B9)
                )
            }

            state.requests.forEachIndexed { index, request ->
                if (index > 0) {
                    HorizontalDivider(
                        color = Color(0xFF91A9B9).copy(alpha = 0.25f)
                    )
                }

                Text(
                    residentSosStateLabel(request.state),
                    color = Color(0xFF20D7FF),
                    fontWeight = FontWeight.Bold
                )

                HistoryValue("Mã SOS", request.id)

                HistoryValue(
                    "Thời gian gửi",
                    residentSosTime(request.createdAt)
                )

                HistoryValue(
                    "Số người cần hỗ trợ",
                    request.numberOfPeople
                        ?.takeIf { it > 0 }
                        ?.toString()
                )

                if (request.state == "rescued") {
                    HistoryValue(
                        "Thời gian hoàn tất",
                        residentSosTime(request.completedAt)
                    )
                }

                val id = request.id

                TextButton(
                    enabled = !id.isNullOrBlank(),
                    onClick = {
                        if (!id.isNullOrBlank()) {
                            onOpenDetail(id)
                        }
                    }
                ) {
                    Text(
                        "Xem chi tiết SOS",
                        color = Color(0xFF20D7FF)
                    )
                }
            }
        }
    }
}

@Composable
private fun HistoryValue(
    label: String,
    value: String?
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            label,
            color = Color(0xFF91A9B9),
            style = MaterialTheme.typography.bodySmall
        )
        Text(
            value?.takeIf { it.isNotBlank() } ?: "Chưa có thông tin",
            color = Color.White
        )
    }
}