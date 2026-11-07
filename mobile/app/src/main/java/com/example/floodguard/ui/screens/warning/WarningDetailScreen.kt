package com.example.floodguard.ui.screens.warning

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.example.floodguard.domain.model.WarningTimeStatus
import com.example.floodguard.domain.model.warningTimeStatusLabel
import com.example.floodguard.ui.components.FloodGuardBottomBar
import com.example.floodguard.ui.components.WarningAccent
import com.example.floodguard.ui.components.WarningBackground
import com.example.floodguard.ui.components.WarningBorder
import com.example.floodguard.ui.components.WarningDataNotice
import com.example.floodguard.ui.components.WarningSecondaryText
import com.example.floodguard.ui.components.WarningSeverityBadge
import com.example.floodguard.ui.components.WarningSurface
import com.example.floodguard.ui.components.WarningTopBar
import com.example.floodguard.ui.navigation.AppRoutes
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

@Composable
fun WarningDetailRoute(
    viewModel: WarningDetailViewModel,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
    onFloodMapClick: () -> Unit = {},
    onSafeLocationClick: () -> Unit = {},
    onSosClick: () -> Unit = {},
    onBottomNavigate: (String) -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val hasDetail = uiState.warningDetail != null && !uiState.isLoading
    LaunchedEffect(viewModel, lifecycleOwner, hasDetail) {
        if (hasDetail) {
            lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (isActive) delay(viewModel.refreshTimeStatus())
            }
        }
    }

    val detail = uiState.warningDetail
    if (detail != null && !uiState.isLoading && uiState.errorMessage == null) {
        WarningDetailScreen(
            detail = detail,
            onBack = onBack,
            onNotificationClick = onNotificationClick,
            onProfileClick = onProfileClick,
            onFloodMapClick = onFloodMapClick,
            onSafeLocationClick = onSafeLocationClick,
            onSosClick = onSosClick,
            onBottomNavigate = onBottomNavigate,
            onRefresh = viewModel::loadWarningDetail,
            areaLoadNotice = uiState.areaLoadNotice
        )
    } else {
        // Keep navigation available during loading and failure as well.
        Scaffold(
            containerColor = WarningBackground,
            topBar = {
                WarningTopBar("Chi tiết cảnh báo", onBack, onNotificationClick, onProfileClick)
            },
            bottomBar = {
                FloodGuardBottomBar(currentRoute = AppRoutes.HOME, onNavigate = onBottomNavigate)
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding).padding(24.dp),
                contentAlignment = Alignment.Center) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(color = WarningAccent)
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            uiState.errorMessage ?: "Không tìm thấy cảnh báo",
                            color = WarningSecondaryText
                        )
                        TextButton(onClick = viewModel::loadWarningDetail) {
                            Text("Thử lại", color = WarningAccent)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun WarningDetailScreen(
    detail: WarningDetail,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit,
    onProfileClick: () -> Unit,
    onFloodMapClick: () -> Unit = {},
    onSafeLocationClick: () -> Unit = {},
    onSosClick: () -> Unit = {},
    onBottomNavigate: (String) -> Unit = {},
    onRefresh: (() -> Unit)? = null,
    areaLoadNotice: String? = null
) {
    Scaffold(
        containerColor = WarningBackground,
        topBar = {
            WarningTopBar(detail.screenTitle, onBack, onNotificationClick, onProfileClick)
        },
        bottomBar = {
            FloodGuardBottomBar(currentRoute = AppRoutes.HOME, onNavigate = onBottomNavigate)
        }
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { WarningDataNotice() }
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        detail.systemStatus,
                        color = if (detail.systemStatus == warningTimeStatusLabel(WarningTimeStatus.EFFECTIVE))
                            WarningAccent else WarningSecondaryText,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f)
                    )
                    onRefresh?.let { refresh ->
                        TextButton(onClick = refresh) { Text("Làm mới", color = WarningAccent) }
                    }
                }
            }
            item {
                Surface(
                    color = WarningSurface, shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, WarningBorder)
                ) {
                    Column(Modifier.fillMaxWidth().padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        WarningSeverityBadge(detail.levelText)
                        Text(
                            detail.headline, color = Color.White,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top) {
                            Icon(Icons.Outlined.LocationOn, null,
                                tint = WarningSecondaryText, modifier = Modifier.size(20.dp))
                            Text(detail.locationSummary, color = Color.White,
                                style = MaterialTheme.typography.bodyLarge)
                        }
                        areaLoadNotice?.let {
                            Text(it, color = WarningSecondaryText, style = MaterialTheme.typography.bodySmall)
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Bắt đầu: ${detail.startTime}", color = WarningSecondaryText,
                                style = MaterialTheme.typography.bodyMedium)
                            Text("Kết thúc: ${detail.endTime ?: "Chưa xác định"}",
                                color = WarningSecondaryText, style = MaterialTheme.typography.bodyMedium)
                            Text("Giờ Việt Nam (GMT+7)", color = WarningSecondaryText,
                                style = MaterialTheme.typography.bodySmall)
                        }
                        HorizontalDivider(color = WarningBorder)
                        Text("Nội dung cảnh báo", color = Color.White,
                            style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(detail.description, color = Color(0xFFD5DEE9),
                            style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
            // These sections only display actual populated values. No mock metrics are added.
            val extraInfo = listOf(
                "Địa bàn trọng yếu" to detail.keyAreas,
                "Lưu vực" to detail.basinInfo,
                "Khung giờ đỉnh lũ" to detail.peakWindow,
                "Ghi chú đỉnh lũ" to detail.peakWindowNote,
                "Mưa tích lũy 6 giờ" to detail.rainfall6h,
                "Ghi chú lượng mưa" to detail.rainfallNote,
                "Mực nước hiện tại" to detail.currentWaterLevel,
                "Ghi chú mực nước" to detail.currentWaterLevelNote,
                "Xả qua tràn" to detail.spillDischarge,
                "Ghi chú xả qua tràn" to detail.spillDischargeNote,
                "Độ sâu dự kiến" to detail.floodDepthForecast,
                "Ghi chú độ sâu" to detail.floodDepthForecastNote,
                "Tuyến đường có nguy cơ" to detail.riskyRoads,
                "Khu dân cư có nguy cơ" to detail.floodedResidentialAreas,
                "Nguy cơ sạt lở" to detail.riverbankLandslideRisk
            ).filter { it.second.isNotBlank() }
            if (extraInfo.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        extraInfo.forEach { (label, value) ->
                            Text(label, color = Color.White, fontWeight = FontWeight.SemiBold)
                            Text(value, color = WarningSecondaryText)
                        }
                    }
                }
            }
            if (detail.safetyGuides.isNotEmpty() || detail.emergencyNote.isNotBlank()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Hướng dẫn hành động", color = Color.White,
                            style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        detail.safetyGuides.filter { it.isNotBlank() }.forEachIndexed { index, text ->
                            Text("${index + 1}. $text", color = WarningSecondaryText)
                        }
                        if (detail.emergencyNote.isNotBlank()) {
                            Text(detail.emergencyNote, color = WarningSecondaryText)
                        }
                    }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Tra cứu và hỗ trợ", color = Color.White,
                        style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    // Full-width actions can grow with the system font size.
                    WarningDetailAction("Xem bản đồ", onFloodMapClick) {
                        Icon(Icons.Outlined.Map, null, modifier = Modifier.size(20.dp))
                    }
                    WarningDetailAction("Điểm tránh trú", onSafeLocationClick) {
                        Icon(Icons.Outlined.Home, null, modifier = Modifier.size(20.dp))
                    }
                    Text(
                        "Nếu bạn đang cần cứu hộ, mở biểu mẫu SOS để gửi yêu cầu.",
                        color = WarningSecondaryText, style = MaterialTheme.typography.bodySmall
                    )
                    OutlinedButton(
                        onClick = onSosClick,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Color(0xFFFF6464)),
                        colors = ButtonDefaults.outlinedButtonColors(
                            containerColor = WarningSurface, contentColor = Color(0xFFFF8B8B)
                        )
                    ) { Text("Mở biểu mẫu SOS", fontWeight = FontWeight.SemiBold) }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    HorizontalDivider(color = WarningBorder)
                    Text("Mã bản tin: ${detail.bulletinNo}", color = WarningSecondaryText,
                        style = MaterialTheme.typography.bodySmall)
                    Text(detail.sourceInfo, color = WarningSecondaryText,
                        style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun WarningDetailAction(
    text: String,
    onClick: () -> Unit,
    icon: @Composable () -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, WarningBorder),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = WarningSurface, contentColor = WarningAccent
        )
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically) {
            icon()
            Text(text, fontWeight = FontWeight.SemiBold)
        }
    }
}
