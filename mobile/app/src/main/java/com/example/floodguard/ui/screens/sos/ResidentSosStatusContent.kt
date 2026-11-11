package com.example.floodguard.ui.screens.sos

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

enum class ResidentSosPhase(val label: String) {
    WAITING("Đã gửi — chờ cứu hộ"),
    RESCUED("Đã cứu")
}

// Mô hình hiển thị của Mobile, không phải DTO hoặc mã trạng thái API.
data class ResidentSosStatusDisplay(
    val id: String,
    val phase: ResidentSosPhase,
    val sentAt: String,
    val completedAt: String? = null,
    val situations: List<String>,
    val numberOfPeople: Int,
    val waterLevel: String,
    val note: String?,
    val initialPosition: String,
    val lastServerPosition: String?,
    val phoneLocationSampledAt: String?,
    val serverLocationReceivedAt: String?,
    val locationUpdateMessage: String
)

@Composable
fun ResidentSosStatusContent(
    data: ResidentSosStatusDisplay,
    isRefreshing: Boolean,
    error: String?,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        StatusSection {
            Text(
                text = data.phase.label,
                style = MaterialTheme.typography.titleLarge,
                color = Color(0xFF20D7FF)
            )

            StatusValue("Mã SOS", data.id)
            StatusValue("Thời gian gửi", data.sentAt)

            if (data.phase == ResidentSosPhase.RESCUED) {
                StatusValue("Thời gian hoàn tất", data.completedAt)
                Text(
                    "Yêu cầu đã kết thúc và được giữ trong lịch sử.",
                    color = Color.White
                )
            }
        }

        StatusSection {
            Text("THÔNG TIN ĐÃ GỬI", color = Color(0xFF20D7FF))
            StatusValue("Tình huống", data.situations.joinToString(", "))
            StatusValue("Số người cần cứu hộ", data.numberOfPeople.toString())
            StatusValue("Mức nước", data.waterLevel)
            StatusValue("Ghi chú", data.note)
            StatusValue("Tọa độ ban đầu đã gửi", data.initialPosition)
        }

        StatusSection {
            Text("VỊ TRÍ VÀ CẬP NHẬT", color = Color(0xFF20D7FF))
            StatusValue(
                "Vị trí cuối hệ thống đã nhận",
                data.lastServerPosition
            )
            StatusValue(
                "Điện thoại lấy vị trí lúc",
                data.phoneLocationSampledAt
            )
            StatusValue(
                "Hệ thống nhận vị trí lúc",
                data.serverLocationReceivedAt
            )

            Text(
                text = if (data.phase == ResidentSosPhase.RESCUED) {
                    "Cập nhật vị trí dành cho SOS này đã kết thúc."
                } else {
                    data.locationUpdateMessage
                },
                color = Color.White
            )
        }

        if (isRefreshing) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth(),
                color = Color(0xFF20D7FF)
            )
        }

        error?.let {
            Text(it, color = Color(0xFFFFB4AB))
            Text(
                "Đang hiển thị dữ liệu từ lần tải thành công trước.",
                color = Color(0xFF91A9B9)
            )
        }

        OutlinedButton(
            onClick = onRefresh,
            enabled = !isRefreshing,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                if (error == null) "Làm mới" else "Thử lại",
                color = Color(0xFF20D7FF)
            )
        }
    }
}

@Composable
private fun StatusSection(
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        color = Color(0xFF102638),
        shape = MaterialTheme.shapes.large,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content
        )
    }
}

@Composable
private fun StatusValue(label: String, value: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            color = Color(0xFF91A9B9),
            style = MaterialTheme.typography.bodySmall
        )
        Text(
            text = value?.takeIf { it.isNotBlank() } ?: "Chưa có thông tin",
            color = Color.White
        )
    }
}