package com.example.floodguard.ui.screens.rescue

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.floodguard.R
import com.example.floodguard.data.model.FloodAlertDto

private val LayerBackground = Color(0xFF122131)
private val LayerText = Color(0xFFD4E4FA)
private val LayerMuted = Color(0xFFBBC9CD)
private val LayerCyan = Color(0xFF8AEBFF)
private val LayerFont = FontFamily(Font(R.font.rescue_be_vietnam_regular))

internal fun rescueSeverityColor(severity: RescueFloodSeverity): Color = when (severity) {
    RescueFloodSeverity.LOW -> Color(0xFF42A5F5)
    RescueFloodSeverity.MEDIUM -> Color(0xFFFDD835)
    RescueFloodSeverity.HIGH -> Color(0xFFFF9800)
    RescueFloodSeverity.CRITICAL -> Color(0xFFEF5350)
    RescueFloodSeverity.UNKNOWN -> Color(0xFF90A4AE)
}

internal fun rescueAreaColor(area: RescueFloodMapArea): Color =
    if (area.isActive) rescueSeverityColor(area.severity) else Color(0xFF90A4AE)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RescueFloodAreaSheet(
    layers: RescueFloodMapLayers,
    state: RescueMapDataUiState,
    selectedAreaId: String?,
    canFocus: Boolean,
    onSelect: (String?) -> Unit,
    onFocus: (RescueFloodMapArea) -> Unit,
    onRetryAreas: () -> Unit,
    onRetryWarnings: () -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = LayerBackground,
        contentColor = LayerText
    ) {
        Column(modifier = Modifier.fillMaxWidth().fillMaxHeight(0.85f).padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (selectedAreaId == null) "Vùng ngập và cảnh báo" else "Thông tin vùng ngập",
                    modifier = Modifier.weight(1f), fontFamily = LayerFont,
                    fontWeight = FontWeight.Bold, fontSize = 18.sp
                )
                TextButton(onClick = onDismiss) { LayerLabel("Đóng", LayerCyan) }
            }
            if (selectedAreaId != null) {
                TextButton(onClick = { onSelect(null) }) { LayerLabel("Danh sách vùng", LayerCyan) }
            }
            // Reset scroll only when changing the selected area, never on GPS updates.
            key(selectedAreaId) {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    state = rememberLazyListState(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (selectedAreaId == null) {
                        item { FloodLegend() }
                        item { LayerLabel("Chạm vùng trên bản đồ hoặc chọn từ danh sách. Màu thể hiện mức độ do hệ thống cung cấp.") }
                        item { AreaLoadNotice(state.floodAreas, onRetryAreas) }
                        if (layers.skippedCount > 0) {
                            item { LayerLabel("${layers.skippedCount} bản ghi không đủ thông tin hoặc có ranh giới không hợp lệ nên không được vẽ.") }
                        }
                        items(layers.areas, key = { "area:${it.id}" }) { area ->
                            LayerCard {
                                LayerLabel(area.name, LayerText, bold = true)
                                AreaStatus(area)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    TextButton(onClick = { onSelect(area.id) }) { LayerLabel("Thông tin", LayerCyan) }
                                    TextButton(onClick = { onFocus(area) }, enabled = canFocus) {
                                        LayerLabel("Xem trên bản đồ", if (canFocus) LayerCyan else LayerMuted)
                                    }
                                }
                            }
                        }
                        item { LayerLabel("Cảnh báo theo lần tải gần nhất", LayerText, bold = true) }
                        item { WarningLoadNotice(state.activeWarnings, onRetryWarnings) }
                        val warnings = (state.activeWarnings as? RescueMapLoadState.Data)?.items.orEmpty()
                        items(warnings.filter { it.status.equals("active", true) }) { warning ->
                            val area = layers.areas.firstOrNull { it.id == warning.areaId?.trim() }
                            WarningCard(warning, area?.name ?: "Chưa có vùng hiển thị tương ứng")
                        }
                    } else {
                        val area = layers.areas.firstOrNull { it.id == selectedAreaId }
                        if (area == null) {
                            item { AreaLoadNotice(state.floodAreas, onRetryAreas) }
                            if (state.floodAreas is RescueMapLoadState.Data) {
                                item { LayerLabel("Vùng này không còn trong dữ liệu hiển thị. Vui lòng chọn lại từ danh sách.") }
                            }
                        } else {
                            item {
                                LayerCard {
                                    LayerLabel(area.name, LayerText, bold = true)
                                    AreaStatus(area)
                                    LayerLabel(area.description)
                                    LayerLabel("Nguồn vùng ngập: ${area.source}")
                                    Button(
                                        onClick = { onFocus(area) }, enabled = canFocus,
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = LayerCyan, contentColor = Color(0xFF051424)
                                        )
                                    ) { Text("Xem trên bản đồ", fontFamily = LayerFont) }
                                }
                            }
                            item { LayerLabel("Cảnh báo liên quan theo lần tải", LayerText, bold = true) }
                            item { WarningLoadNotice(state.activeWarnings, onRetryWarnings) }
                            val loaded = (state.activeWarnings as? RescueMapLoadState.Data)?.items
                            val linked = loaded?.let { rescueWarningsForArea(it, area.id) }.orEmpty()
                            if (loaded != null && linked.isEmpty()) {
                                item { LayerLabel("Không có cảnh báo hiện hành gắn với vùng này trong lần tải gần nhất.") }
                            }
                            items(linked) { warning -> WarningCard(warning, area.name) }
                        }
                    }
                    item {
                        LayerLabel(
                            "Dữ liệu hiển thị theo lần tải từ hệ thống; không xác nhận ngập thời gian thực. " +
                                "Không suy ra độ sâu hoặc mức an toàn từ màu vùng."
                        )
                    }
                    item { Box(modifier = Modifier.size(8.dp)) }
                }
            }
        }
    }
}

@Composable
private fun AreaStatus(area: RescueFloodMapArea) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(12.dp).background(rescueAreaColor(area)))
        LayerLabel("${area.statusLabel} · Mức độ: ${area.severity.label}")
    }
}

@Composable
private fun FloodLegend() {
    LayerCard {
        LayerLabel("Chú giải vùng ngập", LayerText, bold = true)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            LegendEntry(RescueFloodSeverity.LOW)
            LegendEntry(RescueFloodSeverity.MEDIUM)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            LegendEntry(RescueFloodSeverity.HIGH)
            LegendEntry(RescueFloodSeverity.CRITICAL)
        }
        LayerLabel("Xám: vùng đã ngừng hoạt động, trạng thái hoặc mức độ chưa xác định.")
    }
}

@Composable
private fun LegendEntry(severity: RescueFloodSeverity) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(12.dp).background(rescueSeverityColor(severity)))
        LayerLabel(severity.label)
    }
}

@Composable
private fun WarningCard(warning: FloodAlertDto, areaName: String) {
    LayerCard {
        LayerLabel(warning.title?.trim().orEmpty().ifEmpty { "Cảnh báo chưa có tiêu đề" }, LayerText, bold = true)
        LayerLabel("Vùng: $areaName")
        LayerLabel("Mức cảnh báo: ${RescueFloodSeverity.from(warning.severity).label}")
        LayerLabel(warning.content?.trim().orEmpty().ifEmpty { "Chưa có nội dung." })
        LayerLabel("Bắt đầu: ${formatRescueWarningTime(warning.startAt)}")
        LayerLabel("Kết thúc: ${formatRescueWarningTime(warning.endAt)}")
    }
}

@Composable
private fun AreaLoadNotice(state: RescueMapLoadState<*>, onRetry: () -> Unit) {
    when (state) {
        RescueMapLoadState.Loading -> LayerLabel("Đang tải vùng ngập…")
        RescueMapLoadState.Empty -> LayerLabel("Chưa có vùng ngập để hiển thị.")
        is RescueMapLoadState.Error -> RetryNotice(state.message, onRetry)
        is RescueMapLoadState.Data<*> -> if (state.items.isEmpty()) LayerLabel("Chưa có vùng ngập để hiển thị.")
    }
}

@Composable
private fun WarningLoadNotice(state: RescueMapLoadState<*>, onRetry: () -> Unit) {
    when (state) {
        RescueMapLoadState.Loading -> LayerLabel("Đang tải cảnh báo…")
        RescueMapLoadState.Empty -> LayerLabel("Không có cảnh báo hiện hành trong lần tải gần nhất.")
        is RescueMapLoadState.Error -> RetryNotice(state.message, onRetry)
        is RescueMapLoadState.Data<*> -> Unit
    }
}

@Composable
private fun RetryNotice(message: String, onRetry: () -> Unit) {
    LayerLabel(message, Color(0xFFFFB4AB))
    TextButton(onClick = onRetry) { LayerLabel("Thử lại", LayerCyan) }
}

@Composable
private fun LayerCard(content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1C2B3C)), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
    }
}

@Composable
private fun LayerLabel(value: String, color: Color = LayerMuted, bold: Boolean = false) {
    Text(value, color = color, fontFamily = LayerFont, fontSize = 13.sp, lineHeight = 20.sp,
        fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)
}
