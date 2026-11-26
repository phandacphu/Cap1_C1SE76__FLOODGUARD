package com.example.floodguard.ui.screens.warning

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.floodguard.data.repository.FloodWarningV2
import com.example.floodguard.ui.components.WarningAccent
import com.example.floodguard.ui.components.WarningBackground
import com.example.floodguard.ui.components.WarningBorder
import com.example.floodguard.ui.components.WarningSecondaryText
import com.example.floodguard.ui.components.WarningSurface
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private fun warningV2Time(value: String): String = runCatching {
    DateTimeFormatter.ofPattern(
        "dd/MM/yyyy HH:mm",
        Locale.forLanguageTag("vi-VN")
    ).withZone(ZoneId.of("Asia/Ho_Chi_Minh"))
        .format(Instant.parse(value))
}.getOrElse { "Không đọc được thời gian" }

@Composable
private fun V2Panel(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = WarningSurface,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, WarningBorder)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content
        )
    }
}

@Composable
private fun V2Status(alert: FloodWarningV2) {
    Text(
        text = if (alert.status == "active") "Đang bật" else "Đã tắt",
        color = if (alert.status == "active") {
            Color(0xFF70E8B2)
        } else {
            WarningSecondaryText
        },
        style = MaterialTheme.typography.labelLarge
    )
}

@Composable
private fun V2LoadStatus(
    loading: Boolean,
    stale: Boolean,
    error: String?
) {
    if (loading) {
        LinearProgressIndicator(
            modifier = Modifier.fillMaxWidth(),
            color = WarningAccent
        )
    }
    if (stale) {
        Text(
            "Dữ liệu từ lần tải trước, chưa thể cập nhật.",
            color = WarningSecondaryText
        )
    }
    error?.let {
        Text(it, color = WarningSecondaryText)
    }
}

@Composable
private fun V2BulletinCard(
    alert: FloodWarningV2,
    onOpen: (String) -> Unit
) {
    V2Panel {
        V2Status(alert)
        Text(
            alert.title,
            color = Color.White,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Text(
            "Bắt đầu: ${warningV2Time(alert.startAt)} · GMT+7",
            color = WarningSecondaryText,
            style = MaterialTheme.typography.bodySmall
        )
        TextButton(onClick = { onOpen(alert.id) }) {
            Text("Xem chi tiết", color = WarningAccent)
        }
    }
}

@Composable
fun FloodWarningV2Overview(
    state: FloodWarningV2OverviewState,
    onRefresh: () -> Unit,
    onOpen: (String) -> Unit,
    onViewAll: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            "Cảnh báo lũ",
            color = Color.White,
            style = MaterialTheme.typography.titleLarge
        )
        V2LoadStatus(state.loading, state.stale, state.error)
        state.activeCount?.let { count ->
            Text("$count bản tin đang bật", color = WarningSecondaryText)
        }
        state.latest?.let { V2BulletinCard(it, onOpen) }
        if (state.loaded && state.activeAlerts.isEmpty()) {
            Text(
                "Chưa có bản tin đang bật. Bạn vẫn có thể xem lịch sử.",
                color = WarningSecondaryText
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TextButton(onClick = onViewAll) {
                Text("Xem tất cả", color = WarningAccent)
            }
            TextButton(onClick = onRefresh, enabled = !state.loading) {
                Text("Làm mới", color = WarningAccent)
            }
        }
    }
}

@Composable
fun FloodWarningV2ListContent(
    state: FloodWarningV2ListState,
    onFilter: (FloodWarningV2Filter) -> Unit,
    onRefresh: () -> Unit,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(modifier.fillMaxSize(), color = WarningBackground) {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    TextButton(onClick = onBack) {
                        Text("Quay lại", color = WarningAccent)
                    }
                    TextButton(
                        onClick = onRefresh,
                        enabled = !state.loading
                    ) {
                        Text("Làm mới", color = WarningAccent)
                    }
                }
                Text(
                    "Cảnh báo lũ",
                    color = Color.White,
                    style = MaterialTheme.typography.headlineSmall
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FloodWarningV2Filter.values().forEach { filter ->
                        FilterChip(
                            selected = state.filter == filter,
                            onClick = { onFilter(filter) },
                            label = { Text(filter.label) }
                        )
                    }
                }
            }
            item {
                V2LoadStatus(state.loading, state.stale, state.error)
            }
            if (state.loaded && state.items.isEmpty()) {
                item {
                    Text(
                        "Không có bản tin phù hợp.",
                        color = WarningSecondaryText
                    )
                }
            }
            items(state.items, key = { it.id }) {
                V2BulletinCard(it, onOpen)
            }
        }
    }
}

@Composable
fun FloodWarningV2DetailContent(
    state: FloodWarningV2DetailState,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
    onMap: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(modifier.fillMaxSize(), color = WarningBackground) {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    TextButton(onClick = onBack) {
                        Text("Quay lại", color = WarningAccent)
                    }
                    TextButton(
                        onClick = onRefresh,
                        enabled = !state.loading && !state.notFound
                    ) {
                        Text("Làm mới", color = WarningAccent)
                    }
                }
                V2LoadStatus(state.loading, state.stale, state.error)
            }
            state.alert?.let { alert ->
                item {
                    V2Panel {
                        V2Status(alert)
                        Text(
                            alert.title,
                            color = Color.White,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold
                        )
                        if (alert.status == "inactive") {
                            Text(
                                "Bản tin đã được Admin tắt.",
                                color = WarningSecondaryText
                            )
                        }
                        Text(
                            "Bắt đầu: ${warningV2Time(alert.startAt)}",
                            color = WarningSecondaryText
                        )
                        Text(
                            "Kết thúc: ${
                                alert.endAt?.let(::warningV2Time)
                                    ?: "Đang có hiệu lực"
                            }",
                            color = WarningSecondaryText
                        )
                        Text("Giờ Việt Nam · GMT+7", color = WarningSecondaryText)
                    }
                }
                item {
                    V2Panel {
                        Text(
                            "Nội dung cảnh báo",
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            alert.content,
                            color = Color.White,
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Text(
                            "Phạm vi áp dụng",
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            "Toàn bộ các vùng được hệ thống công bố: " +
                                    "vùng ngập hiện tại, vùng ngập lịch sử và vùng trũng.",
                            color = WarningSecondaryText
                        )
                        Text(
                            "Ngập lịch sử là vùng từng ngập. Vùng trũng có nguy cơ " +
                                    "khi mưa lớn; không đồng nghĩa đang ngập.",
                            color = WarningSecondaryText
                        )
                        if (alert.status == "inactive") {
                            Text(
                                "Bản đồ hiển thị bộ vùng hiện tại, " +
                                        "không phải ảnh chụp tại thời điểm tắt bản tin.",
                                color = WarningSecondaryText
                            )
                        }
                        OutlinedButton(
                            onClick = onMap,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Xem vùng trên bản đồ", color = WarningAccent)
                        }
                    }
                }
                item {
                    Text(
                        "Nguồn: Admin FLOODGUARD\nMã bản tin: ${alert.id}",
                        color = WarningSecondaryText,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}