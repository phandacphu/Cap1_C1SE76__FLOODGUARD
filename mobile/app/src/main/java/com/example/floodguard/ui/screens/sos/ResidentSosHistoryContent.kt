package com.example.floodguard.ui.screens.sos

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun ResidentSosHistoryContent(
    requests: List<ResidentSosStatusDisplay>,
    isLoading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
    onOpenRequest: (String) -> Unit,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState()
) {
    val duplicateIds = requests
        .groupingBy { it.id }
        .eachCount()
        .filterValues { it > 1 }
        .keys

    LazyColumn(
        state = listState,
        modifier = modifier,
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text(
                text = "LỊCH SỬ SOS",
                color = Color.White,
                style = MaterialTheme.typography.titleLarge
            )
        }

        item {
            OutlinedButton(
                onClick = onRefresh,
                enabled = !isLoading,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (error == null) "Làm mới" else "Thử lại",
                    color = Color(0xFF20D7FF)
                )
            }
        }

        if (isLoading) {
            item {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = Color(0xFF20D7FF)
                )
                Text(
                    "Đang tải lịch sử SOS...",
                    color = Color(0xFF91A9B9)
                )
            }
        }

        error?.let { message ->
            item {
                Text(message, color = Color(0xFFFFB4AB))

                if (requests.isNotEmpty()) {
                    Text(
                        "Đang giữ dữ liệu từ lần tải thành công trước.",
                        color = Color(0xFF91A9B9)
                    )
                }
            }
        }

        if (!isLoading && error == null && requests.isEmpty()) {
            item {
                Text(
                    "Bạn chưa có yêu cầu SOS nào.",
                    color = Color(0xFF91A9B9)
                )
            }
        }

        // Khóa theo vị trí để vẫn hiển thị được dữ liệu lỗi có ID trùng.
        // Không cho mở chi tiết khi ID thiếu hoặc trùng.
        items(
            items = requests.withIndex().toList(),
            key = { it.index }
        ) { indexed ->
            val request = indexed.value
            val validId =
                request.id.isNotBlank() && request.id !in duplicateIds

            Surface(
                color = Color(0xFF102638),
                shape = MaterialTheme.shapes.large,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = request.phase.label,
                        color = Color(0xFF20D7FF),
                        style = MaterialTheme.typography.titleMedium
                    )

                    Text(
                        text = "Mã SOS: ${request.id.ifBlank { "Chưa có mã" }}",
                        color = Color.White
                    )

                    Text(
                        text = "Thời gian gửi: ${request.sentAt}",
                        color = Color.White
                    )

                    Text(
                        text = "Số người: ${request.numberOfPeople}",
                        color = Color.White
                    )

                    if (request.phase == ResidentSosPhase.RESCUED) {
                        Text(
                            text = "Hoàn tất: " +
                                    (request.completedAt ?: "Chưa có thông tin"),
                            color = Color(0xFF91A9B9)
                        )
                    }

                    if (!validId) {
                        Text(
                            "Mã SOS thiếu hoặc trùng. Không thể mở chi tiết.",
                            color = Color(0xFFFFB4AB)
                        )
                    }

                    TextButton(
                        enabled = validId,
                        onClick = { onOpenRequest(request.id) }
                    ) {
                        Text(
                            "Xem chi tiết",
                            color = if (validId) {
                                Color(0xFF20D7FF)
                            } else {
                                Color(0xFF91A9B9)
                            }
                        )
                    }
                }
            }
        }
    }
}