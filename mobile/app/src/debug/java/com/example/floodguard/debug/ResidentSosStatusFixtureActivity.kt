package com.example.floodguard.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.floodguard.ui.screens.sos.*

class ResidentSosStatusFixtureActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            MaterialTheme {
                StatusFixture()
            }
        }
    }
}

@Composable
private fun StatusFixture() {
    var scenario by rememberSaveable { mutableIntStateOf(0) }

    val phase = if (scenario == 3) {
        ResidentSosPhase.RESCUED
    } else {
        ResidentSosPhase.WAITING
    }

    val data = ResidentSosStatusDisplay(
        id = "FIXTURE-SOS-A",
        phase = phase,
        sentAt = "07/11/2026 21:00:00",
        completedAt = if (scenario == 3) "07/11/2026 21:15:00" else null,
        situations = listOf("Bị mắc kẹt do ngập", "Có người bị thương"),
        numberOfPeople = 2,
        waterLevel = "Dưới đầu gối",
        note = "Dữ liệu mẫu để kiểm thử giao diện.",
        initialPosition = "16.0600, 108.1700",
        lastServerPosition = "16.0602, 108.1703",
        phoneLocationSampledAt = "07/11/2026 21:01:00",
        serverLocationReceivedAt = "07/11/2026 21:01:02",
        locationUpdateMessage = when (scenario) {
            1 -> "Mất kết nối. Giữ vị trí cuối hệ thống đã nhận."
            2 -> "Chưa lấy được GPS mới. Giữ vị trí cuối hệ thống đã nhận."
            else -> "Lần cập nhật vị trí mẫu gần nhất đã thành công."
        }
    )

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

        Row(Modifier.fillMaxWidth()) {
            TextButton(onClick = { scenario = 0 }) {
                Text("Chờ cứu")
            }
            TextButton(onClick = { scenario = 1 }) {
                Text("Mất mạng")
            }
            TextButton(onClick = { scenario = 2 }) {
                Text("Mất GPS")
            }
        }

        TextButton(onClick = { scenario = 3 }) {
            Text("Mô phỏng Backend báo đã cứu")
        }

        ResidentSosStatusContent(
            data = data,
            isRefreshing = false,
            error = if (scenario == 1) {
                "Lỗi tải dữ liệu mô phỏng."
            } else {
                null
            },
            onRefresh = {
                // Chỉ đổi dữ liệu mẫu; không gửi request.
                if (scenario != 3) scenario = 0
            },
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        )
    }
}