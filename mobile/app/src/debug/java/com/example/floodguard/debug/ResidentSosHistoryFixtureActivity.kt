package com.example.floodguard.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.floodguard.ui.screens.sos.*

class ResidentSosHistoryFixtureActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            MaterialTheme {
                HistoryFixture()
            }
        }
    }
}

private fun historyFixtureData(): List<ResidentSosStatusDisplay> {
    val waiting = ResidentSosStatusDisplay(
        id = "FIXTURE-SOS-A",
        phase = ResidentSosPhase.WAITING,
        sentAt = "07/11/2026 21:00:00",
        situations = listOf("Bị mắc kẹt do ngập"),
        numberOfPeople = 2,
        waterLevel = "Dưới đầu gối",
        note = "Yêu cầu A — đang chờ cứu hộ, dữ liệu mẫu.",
        initialPosition = "16.0600, 108.1700",
        lastServerPosition = "16.0602, 108.1703",
        phoneLocationSampledAt = "07/11/2026 21:01:00",
        serverLocationReceivedAt = "07/11/2026 21:01:02",
        locationUpdateMessage = "Lần cập nhật vị trí mẫu đã thành công."
    )

    val rescued = waiting.copy(
        id = "FIXTURE-SOS-B",
        phase = ResidentSosPhase.RESCUED,
        sentAt = "06/11/2026 18:00:00",
        completedAt = "06/11/2026 18:30:00",
        situations = listOf("Cần sơ tán khẩn cấp"),
        numberOfPeople = 5,
        waterLevel = "Đến thắt lưng",
        note = "Yêu cầu B — đã cứu, dữ liệu mẫu.",
        initialPosition = "16.0700, 108.1800",
        lastServerPosition = "16.0701, 108.1802",
        phoneLocationSampledAt = "06/11/2026 18:10:00",
        serverLocationReceivedAt = "06/11/2026 18:10:02"
    )

    return listOf(waiting, rescued)
}

@Composable
private fun HistoryFixture() {
    var scenario by rememberSaveable { mutableIntStateOf(0) }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    val samples = remember { historyFixtureData() }

    val visibleRequests = when (scenario) {
        1, 2, 3 -> emptyList()
        else -> samples
    }

    val error = when (scenario) {
        3, 4 -> "Lỗi tải lịch sử mô phỏng."
        else -> null
    }

    // Chi tiết lấy đúng ID đã chọn, không lấy bản ghi đầu tiên thay thế.
    val selectedRequest = samples.singleOrNull { it.id == selectedId }

    BackHandler(enabled = selectedId != null) {
        selectedId = null
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF071521))
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        Text(
            "KIỂM THỬ CÔ LẬP — DỮ LIỆU MẪU",
            color = Color(0xFFFFC107),
            modifier = Modifier.padding(12.dp)
        )

        Text(
            "Không gọi API, không lấy GPS, không gửi SOS.",
            color = Color.White,
            modifier = Modifier.padding(horizontal = 12.dp)
        )

        if (selectedId == null) {
            Row {
                TextButton(onClick = { scenario = 0 }) {
                    Text("Có dữ liệu")
                }
                TextButton(onClick = { scenario = 1 }) {
                    Text("Đang tải")
                }
                TextButton(onClick = { scenario = 2 }) {
                    Text("Trống")
                }
            }

            Row {
                TextButton(onClick = { scenario = 3 }) {
                    Text("Lỗi lần đầu")
                }
                TextButton(onClick = { scenario = 4 }) {
                    Text("Lỗi có dữ liệu cũ")
                }
            }

            ResidentSosHistoryContent(
                requests = visibleRequests,
                isLoading = scenario == 1,
                error = error,
                onRefresh = { scenario = 0 },
                onOpenRequest = { selectedId = it },
                listState = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            )
        } else {
            TextButton(onClick = { selectedId = null }) {
                Text("‹ Quay lại lịch sử", color = Color(0xFF20D7FF))
            }

            if (selectedRequest != null) {
                key(selectedRequest.id) {
                    ResidentSosStatusContent(
                        data = selectedRequest,
                        isRefreshing = false,
                        error = null,
                        onRefresh = {
                            // Dữ liệu mẫu giữ nguyên; không gọi API.
                        },
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                    )
                }
            } else {
                Text(
                    "Không tìm thấy đúng mã SOS đã chọn.",
                    color = Color(0xFFFFB4AB),
                    modifier = Modifier.padding(16.dp)
                )
            }
        }
    }
}