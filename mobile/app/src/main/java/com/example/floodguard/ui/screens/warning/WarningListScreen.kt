package com.example.floodguard.ui.screens.warning

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.example.floodguard.domain.model.Warning
import com.example.floodguard.domain.model.WarningTimeStatus
import com.example.floodguard.ui.components.FloodGuardBottomBar
import com.example.floodguard.ui.components.WarningAccent
import com.example.floodguard.ui.components.WarningBackground
import com.example.floodguard.ui.components.WarningBorder
import com.example.floodguard.ui.components.WarningCard
import com.example.floodguard.ui.components.WarningDataNotice
import com.example.floodguard.ui.components.WarningSecondaryText
import com.example.floodguard.ui.components.WarningSurface
import com.example.floodguard.ui.components.WarningTopBar
import com.example.floodguard.ui.navigation.AppRoutes
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import java.time.Instant

@Composable
fun WarningListScreen(
    onBackClick: () -> Unit,
    onWarningClick: (String) -> Unit,
    onNotificationClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
    onBottomNavigate: (String) -> Unit = {},
    viewModel: WarningViewModel
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedStatus by rememberSaveable { mutableStateOf("effective") }
    var selectedSeverity by rememberSaveable { mutableStateOf("all") }
    val lifecycleOwner = LocalLifecycleOwner.current
    val hasWarnings = uiState is WarningUiState.Success
    LaunchedEffect(viewModel, lifecycleOwner, hasWarnings) {
        if (hasWarnings) {
            lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (isActive) delay(viewModel.refreshTimeStatuses())
            }
        }
    }

    Scaffold(
        containerColor = WarningBackground,
        topBar = {
            WarningTopBar("Cảnh báo lũ", onBackClick, onNotificationClick, onProfileClick)
        },
        bottomBar = {
            FloodGuardBottomBar(currentRoute = AppRoutes.HOME, onNavigate = onBottomNavigate)
        }
    ) { padding ->
        when (val state = uiState) {
            WarningUiState.Loading -> Box(
                Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center
            ) { CircularProgressIndicator(color = WarningAccent) }

            is WarningUiState.Error -> Column(
                Modifier.fillMaxSize().padding(padding).padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Không thể tải cảnh báo", color = Color.White, fontWeight = FontWeight.Bold)
                Text(state.message, color = WarningSecondaryText, modifier = Modifier.padding(top = 8.dp))
                TextButton(onClick = viewModel::retry) { Text("Thử lại", color = WarningAccent) }
            }

            else -> {
                val stateWarnings = (state as? WarningUiState.Success)?.warnings.orEmpty()
                val filteredWarnings = stateWarnings.filter { warning ->
                    val matchesStatus = when (selectedStatus) {
                        "effective" -> warning.timeStatus == WarningTimeStatus.EFFECTIVE
                        "upcoming" -> warning.timeStatus == WarningTimeStatus.UPCOMING
                        "expired" -> warning.timeStatus == WarningTimeStatus.EXPIRED
                        "disabled" -> warning.timeStatus == WarningTimeStatus.DISABLED
                        else -> true
                    }
                    matchesStatus && (selectedSeverity == "all" ||
                        warning.severity.equals(selectedSeverity, ignoreCase = true))
                }.sortedWith(
                    compareByDescending<Warning> {
                        when (it.severity.lowercase()) {
                            "critical" -> 4
                            "high" -> 3
                            "medium" -> 2
                            "low" -> 1
                            else -> 0
                        }
                    }.thenByDescending { runCatching { Instant.parse(it.startTime) }.getOrDefault(Instant.MIN) }
                )
                LazyColumn(
                    Modifier.fillMaxSize().padding(padding),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item { WarningDataNotice() }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        "${stateWarnings.count { it.isEffectiveNow }} đang có hiệu lực",
                                        color = Color.White, style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        "Tổng ${stateWarnings.size} bản tin • Giờ Việt Nam",
                                        color = WarningSecondaryText, style = MaterialTheme.typography.bodySmall
                                    )
                                }
                                TextButton(onClick = viewModel::retry) {
                                    Text("Làm mới", color = WarningAccent)
                                }
                            }
                            (state as? WarningUiState.Success)?.areaLoadNotice?.let {
                                Text(it, color = WarningSecondaryText, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                    item {
                        WarningFilterRow(
                            label = "",
                            options = listOf(
                                "effective" to "Đang có hiệu lực", "all" to "Tất cả",
                                "upcoming" to "Chưa có hiệu lực", "expired" to "Đã hết hạn",
                                "disabled" to "Đã tắt"
                            ),
                            selected = selectedStatus,
                            onSelect = { selectedStatus = it }
                        )
                    }
                    item {
                        WarningFilterRow(
                            label = "Mức độ",
                            options = listOf(
                                "all" to "Tất cả", "critical" to "Khẩn cấp", "high" to "Cao",
                                "medium" to "Trung bình", "low" to "Thấp"
                            ),
                            selected = selectedSeverity,
                            onSelect = { selectedSeverity = it }
                        )
                    }
                    if (filteredWarnings.isEmpty()) {
                        item {
                            Surface(
                                color = WarningSurface, shape = RoundedCornerShape(14.dp),
                                border = BorderStroke(1.dp, WarningBorder)
                            ) {
                                Column(Modifier.fillMaxWidth().padding(20.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(
                                        if (stateWarnings.isEmpty()) "Chưa có bản tin cảnh báo"
                                        else if (selectedStatus == "effective" && selectedSeverity == "all")
                                            "Không có cảnh báo đang có hiệu lực"
                                        else "Không có bản tin phù hợp bộ lọc",
                                        color = Color.White, fontWeight = FontWeight.SemiBold
                                    )
                                    if (stateWarnings.isNotEmpty()) {
                                        TextButton(onClick = {
                                            selectedStatus = "all"
                                            selectedSeverity = "all"
                                        }) { Text("Xem tất cả bản tin", color = WarningAccent) }
                                    }
                                }
                            }
                        }
                    } else {
                        items(filteredWarnings, key = { it.id }) { warning ->
                            WarningCard(warning) { onWarningClick(warning.id) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WarningFilterRow(
    label: String,
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (label.isNotBlank()) {
            Text(label, color = WarningSecondaryText, style = MaterialTheme.typography.labelLarge)
        }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            options.forEach { (key, title) ->
                FilterChip(
                    selected = selected == key,
                    onClick = { onSelect(key) },
                    label = { Text(title) },
                    shape = RoundedCornerShape(18.dp),
                    colors = FilterChipDefaults.filterChipColors(
                        containerColor = WarningSurface,
                        labelColor = WarningSecondaryText,
                        selectedContainerColor = Color(0xFF123747),
                        selectedLabelColor = WarningAccent
                    ),
                    border = BorderStroke(1.dp, if (selected == key) WarningAccent else WarningBorder)
                )
            }
        }
    }
}
