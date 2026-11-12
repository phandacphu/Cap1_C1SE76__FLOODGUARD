package com.example.floodguard.ui.screens.sos

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val StatusBackground = Color(0xFF071521)
private val StatusCard = Color(0xFF102638)
private val StatusCyan = Color(0xFF20D7FF)
private val StatusMuted = Color(0xFF91A9B9)

@Composable
fun SosStatusScreen(
    state: SosStatusUiState,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
    historyState: ResidentSosEventHistoryState =
        ResidentSosEventHistoryState(),
    gpsContent: @Composable () -> Unit = {}
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(StatusBackground)
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
        ) {
            TextButton(onClick = onBack) {
                Text("‹ Quay lại", color = StatusCyan)
            }

            Text(
                text = "TRẠNG THÁI SOS",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 8.dp)
            )
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Thông tin do hệ thống cung cấp. " +
                        "Trạng thái không tự động xác nhận đội cứu hộ đã đến.",
                color = StatusMuted,
                fontSize = 13.sp
            )

            if (state.isLoading) {
                CircularProgressIndicator(
                    color = StatusCyan,
                    modifier = Modifier.size(28.dp)
                )

                Text("Đang tải trạng thái SOS...", color = StatusMuted)
            }

            state.error?.let { error ->
                Text(
                    text = error,
                    color = Color(0xFFFFB4AB)
                )

                if (state.request != null) {
                    Text(
                        text = "Đang hiển thị dữ liệu từ lần tải thành công trước.",
                        color = StatusMuted,
                        fontSize = 13.sp
                    )
                }
            }

            state.request?.let { request ->
                Surface(
                    color = StatusCard,
                    shape = RoundedCornerShape(18.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        SosStatusField("Mã yêu cầu", request.id)

                        SosStatusField(
                            "Tình trạng",
                            residentSosStateLabel(request.state)
                        )

                        when (request.state) {
                            "active" -> Text(
                                text = "Yêu cầu đang chờ cứu hộ. " +
                                        "Thông báo này không xác nhận đội cứu hộ đã đến.",
                                color = StatusMuted,
                                fontSize = 12.sp
                            )

                            "rescued" -> Text(
                                text = "Yêu cầu đã được đánh dấu đã cứu và giữ trong lịch sử.",
                                color = StatusMuted,
                                fontSize = 12.sp
                            )

                            else -> Text(
                                text = "Chưa có trạng thái thuộc luồng SOS hiện tại. " +
                                        "Không tự xác nhận yêu cầu đã được cứu.",
                                color = StatusMuted,
                                fontSize = 12.sp
                            )
                        }

                        SosStatusField(
                            "Tình huống",
                            request.situations
                                ?.takeIf { it.isNotEmpty() }
                                ?.joinToString(", ") {
                                    residentSosSituationLabel(it)
                                }
                        )

                        SosStatusField(
                            "Số người cần hỗ trợ",
                            request.numberOfPeople
                                ?.takeIf { it > 0 }
                                ?.toString()
                        )

                        SosStatusField(
                            "Mức nước",
                            residentSosWaterLabel(request.waterLevel)
                        )

                        SosStatusField("Ghi chú", request.note)

                        SosStatusField(
                            "Thời gian gửi",
                            residentSosTime(request.createdAt)
                        )

                        if (request.state == "rescued") {
                            SosStatusField(
                                "Thời gian hoàn tất",
                                residentSosTime(request.completedAt)
                            )
                        }

                        SosStatusField(
                            "Vị trí ban đầu",
                            residentSosPosition(request.initialLocation)
                        )

                        SosStatusField(
                            "Vị trí cuối Backend đã lưu",
                            residentSosPosition(request.location)
                        )

                        SosStatusField(
                            "Thời điểm lấy mẫu GPS đã được Backend chấp nhận",
                            residentSosTime(request.locationCapturedAt)
                        )

                        SosStatusField(
                            "Thời điểm Backend nhận vị trí",
                            residentSosTime(request.locationReceivedAt)
                        )

                        SosStatusField(
                            "Thời gian cập nhật yêu cầu",
                            residentSosTime(request.updatedAt)
                        )

                        Text(
                            text = "Thời gian hiển thị theo giờ Việt Nam (GMT+7). " +
                                    "Vị trí trên là dữ liệu Backend đã lưu.",
                            color = StatusMuted,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            if (state.request != null) {
                gpsContent()
                ResidentSosEventHistory(historyState)
            }
            state.loadedAtMillis?.let { timestamp ->
                val formatted = SimpleDateFormat(
                    "dd/MM/yyyy HH:mm:ss",
                    Locale.forLanguageTag("vi-VN")
                ).format(Date(timestamp))

                Text(
                    text = "Ứng dụng tải thành công lúc: $formatted",
                    color = StatusMuted,
                    fontSize = 12.sp
                )
            }

            OutlinedButton(
                onClick = onRefresh,
                enabled = !state.isLoading,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (state.error != null) "Thử lại" else "Làm mới",
                    color = StatusCyan
                )
            }
        }
    }
}

@Composable
private fun SosStatusField(label: String, value: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(
            text = label,
            color = StatusMuted,
            fontSize = 12.sp
        )

        Text(
            text = value?.takeIf { it.isNotBlank() } ?: "Chưa có thông tin",
            color = Color.White,
            fontSize = 15.sp
        )
    }
}