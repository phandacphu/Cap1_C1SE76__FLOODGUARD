package com.example.floodguard.ui.screens.rescue

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Sos
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.floodguard.R
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private val OverviewBackground = Color(0xFF051424)
private val OverviewSurface = Color(0xFF122131)
private val OverviewAlternate = Color(0xFF1C2B3C)
private val OverviewText = Color(0xFFD4E4FA)
private val OverviewMuted = Color(0xFFBBC9CD)
private val OverviewCyan = Color(0xFF8AEBFF)
private val OverviewGreen = Color(0xFF45F797)
private val OverviewRed = Color(0xFFFFB4AB)
private val OverviewBorder = Color(0xFF2C3A4C)

private val OverviewFont = FontFamily(
    Font(R.font.rescue_be_vietnam_regular, FontWeight.Normal),
    Font(R.font.rescue_be_vietnam_semibold, FontWeight.SemiBold),
    Font(R.font.rescue_be_vietnam_bold, FontWeight.Bold)
)

// These are UI destinations, not registered navigation routes.
// Enable each destination only after its Rescue route and role guard exist.
enum class RescueOverviewDestination {
    MAP, SOS_LIST, SOS_NEW, SOS_IN_PROGRESS, MY_TASKS,
    MY_COMPLETED_TASKS, HISTORY, SAFE_LOCATIONS, WARNINGS
}

enum class RescueOverviewSection { SUMMARY, WARNINGS, MAP, PRIORITY_SOS, MY_TASKS }

enum class RescueSummaryMetric(
    val title: String,
    val scope: String,
    val destination: RescueOverviewDestination
) {
    NEW_SOS("SOS mới", "Yêu cầu được phép xem", RescueOverviewDestination.SOS_NEW),
    IN_PROGRESS("Đang xử lý", "Yêu cầu được phép xem", RescueOverviewDestination.SOS_IN_PROGRESS),
    MY_TASKS("Nhiệm vụ của tôi", "Tài khoản hiện tại", RescueOverviewDestination.MY_TASKS),
    COMPLETED("Đã hoàn tất", "Nhiệm vụ của tôi", RescueOverviewDestination.MY_COMPLETED_TASKS)
}

sealed interface RescueSummaryState {
    data object NotReady : RescueSummaryState
    data object Loading : RescueSummaryState
    data object Empty : RescueSummaryState
    data class Failed(val message: String) : RescueSummaryState
    data class Value(val count: Int) : RescueSummaryState {
        init { require(count >= 0) }
    }
}

sealed interface RescueOverviewSectionState {
    data object NotReady : RescueOverviewSectionState
    data object Loading : RescueOverviewSectionState
    data class Empty(val message: String) : RescueOverviewSectionState
    data class Failed(val message: String) : RescueOverviewSectionState
}

data class RescueOverviewUiState(
    val summaries: Map<RescueSummaryMetric, RescueSummaryState> = emptyMap(),
    val warnings: RescueOverviewSectionState = RescueOverviewSectionState.NotReady,
    val map: RescueOverviewSectionState = RescueOverviewSectionState.NotReady,
    val prioritySos: RescueOverviewSectionState = RescueOverviewSectionState.NotReady,
    val myTasks: RescueOverviewSectionState = RescueOverviewSectionState.NotReady
)

@Composable
fun RescueOverviewScreen(
    onLogout: suspend () -> Result<Unit>,
    onLoggedOut: () -> Unit,
    uiState: RescueOverviewUiState = RescueOverviewUiState(),
    availableDestinations: Set<RescueOverviewDestination> = emptySet(),
    onOpenDestination: ((RescueOverviewDestination) -> Unit)? = null,
    onRetry: ((RescueOverviewSection) -> Unit)? = null
) {
    var isLoggingOut by remember { mutableStateOf(false) }
    var logoutError by remember { mutableStateOf<String?>(null) }
    var menuExpanded by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    fun canOpen(destination: RescueOverviewDestination): Boolean =
        !isLoggingOut && onOpenDestination != null && destination in availableDestinations

    fun openDestination(destination: RescueOverviewDestination) {
        if (canOpen(destination)) onOpenDestination?.invoke(destination)
    }

    val logout: () -> Unit = {
        if (!isLoggingOut) {
            isLoggingOut = true
            logoutError = null
            scope.launch {
                try {
                    val result = onLogout()
                    if (result.isSuccess) {
                        onLoggedOut()
                    } else {
                        logoutError = "Không thể đăng xuất. Vui lòng thử lại."
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    logoutError = "Không thể đăng xuất. Vui lòng thử lại."
                } finally {
                    isLoggingOut = false
                }
            }
        }
    }

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = OverviewCyan,
            onPrimary = OverviewBackground,
            surface = OverviewSurface,
            onSurface = OverviewText,
            background = OverviewBackground,
            onBackground = OverviewText,
            error = OverviewRed
        )
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = OverviewBackground
        ) {
            Scaffold(
                modifier = Modifier.safeDrawingPadding(),
                containerColor = OverviewBackground,
                contentWindowInsets = WindowInsets(0, 0, 0, 0),
                topBar = {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Image(
                            painter = painterResource(R.drawable.rescue_overview_logo),
                            contentDescription = null,
                            modifier = Modifier.size(28.dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            OverviewLabel("FLOODGUARD", 15.sp, OverviewCyan, FontWeight.Bold)
                            OverviewLabel("KHU VỰC CỨU HỘ", 10.sp, OverviewGreen, FontWeight.SemiBold)
                        }
                        Box {
                            TextButton(
                                onClick = { menuExpanded = true },
                                enabled = !isLoggingOut
                            ) { Icon(Icons.Outlined.Menu, contentDescription = "Mở menu", tint = OverviewCyan) }
                            DropdownMenu(
                                expanded = menuExpanded,
                                onDismissRequest = { menuExpanded = false }
                            ) {
                                DropdownMenuItem(
                                    text = { OverviewLabel("Đăng xuất") },
                                    enabled = !isLoggingOut,
                                    onClick = { menuExpanded = false; logout() }
                                )
                            }
                        }
                    }
                },
                bottomBar = {
                    NavigationBar(
                        containerColor = Color(0xFF0D1C2D),
                        tonalElevation = 0.dp,
                        windowInsets = WindowInsets(0, 0, 0, 0)
                    ) {
                        val items = listOf(
                            Triple("Tổng quan", Icons.Outlined.Dashboard, null),
                            Triple("Bản đồ", Icons.Outlined.Map, RescueOverviewDestination.MAP),
                            Triple("SOS", Icons.Outlined.Sos, RescueOverviewDestination.SOS_LIST),
                            Triple("Nhiệm vụ", Icons.Outlined.History, RescueOverviewDestination.MY_TASKS)
                        )
                        items.forEach { (label, icon, destination) ->
                            val enabled = !isLoggingOut && (destination == null || canOpen(destination))
                            NavigationBarItem(
                                selected = destination == null,
                                enabled = enabled,
                                onClick = {
                                    if (destination == null) scope.launch { listState.animateScrollToItem(0) }
                                    else openDestination(destination)
                                },
                                icon = {
                                    Icon(
                                        imageVector = icon,
                                        contentDescription = null,
                                        modifier = Modifier.size(22.dp)
                                    )
                                },
                                label = {
                                    OverviewLabel(
                                        if (destination != null && !canOpen(destination)) "$label\nSắp có" else label,
                                        10.sp,
                                        if (destination == null) OverviewCyan else OverviewMuted
                                    )
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = OverviewCyan,
                                    indicatorColor = OverviewAlternate,
                                    unselectedIconColor = OverviewMuted,
                                    disabledIconColor = OverviewMuted.copy(alpha = 0.5f)
                                )
                            )
                        }
                    }
                }
            ) { padding ->
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    state = listState,
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    item(key = "title") {
                        OverviewLabel("Tổng quan cứu hộ", 23.sp, weight = FontWeight.Bold)
                    }
                    item(key = "warning") {
                        OverviewPanel("Cảnh báo lũ tại khu vực") {
                            SectionStatus(
                                state = uiState.warnings,
                                pendingMessage = "Thông tin cảnh báo chưa sẵn sàng.",
                                onRetry = onRetry?.let { retry ->
                                    { retry(RescueOverviewSection.WARNINGS) }
                                }
                            )
                            OverviewAction("Xem cảnh báo", canOpen(RescueOverviewDestination.WARNINGS)) {
                                openDestination(RescueOverviewDestination.WARNINGS)
                            }
                        }
                    }
                    item(key = "summaries") {
                        BoxWithConstraints {
                            val singleColumn = (maxWidth < 340.dp) || (LocalDensity.current.fontScale > 1.2f)
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                RescueSummaryMetric.entries.chunked(if (singleColumn) 1 else 2).forEach { metrics ->
                                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        metrics.forEach { metric ->
                                            SummaryTile(
                                                metric = metric,
                                                state = uiState.summaries[metric] ?: RescueSummaryState.NotReady,
                                                modifier = Modifier.weight(1f),
                                                canOpen = canOpen(metric.destination),
                                                onOpen = { openDestination(metric.destination) },
                                                onRetry = onRetry?.let { retry ->
                                                    { retry(RescueOverviewSection.SUMMARY) }
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                    item(key = "map") {
                        OverviewPanel("Bản đồ cứu hộ") {
                            Box(
                                modifier = Modifier.fillMaxWidth().heightIn(min = 190.dp)
                                    .background(OverviewBackground, RoundedCornerShape(10.dp))
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.Map,
                                        contentDescription = null,
                                        modifier = Modifier.size(32.dp),
                                        tint = OverviewCyan
                                    )
                                    SectionStatus(
                                        state = uiState.map,
                                        pendingMessage = "Bản đồ cứu hộ chưa sẵn sàng.",
                                        onRetry = onRetry?.let { retry ->
                                            { retry(RescueOverviewSection.MAP) }
                                        }
                                    )
                                }
                            }
                            OverviewLabel(
                                "Dữ liệu ngập lịch sử là thông tin tham khảo, không phải cảnh báo hiện tại.",
                                12.sp, OverviewMuted
                            )
                            OverviewAction("Mở bản đồ cứu hộ", canOpen(RescueOverviewDestination.MAP)) {
                                openDestination(RescueOverviewDestination.MAP)
                            }
                        }
                    }
                    item(key = "priority") {
                        OverviewPanel("SOS ưu tiên cao") {
                            OverviewLabel("Yêu cầu được phép xem, sắp xếp theo mức độ ưu tiên.", 12.sp, OverviewMuted)
                            SectionStatus(
                                state = uiState.prioritySos,
                                pendingMessage = "Chưa có dữ liệu SOS để hiển thị.",
                                onRetry = onRetry?.let { retry ->
                                    { retry(RescueOverviewSection.PRIORITY_SOS) }
                                }
                            )
                            OverviewAction("Xem danh sách SOS", canOpen(RescueOverviewDestination.SOS_LIST), primary = true) {
                                openDestination(RescueOverviewDestination.SOS_LIST)
                            }
                        }
                    }
                    item(key = "tasks") {
                        OverviewPanel("Nhiệm vụ của tôi") {
                            OverviewLabel("Công việc thuộc tài khoản đang đăng nhập.", 12.sp, OverviewMuted)
                            SectionStatus(
                                state = uiState.myTasks,
                                pendingMessage = "Chưa có dữ liệu nhiệm vụ để hiển thị.",
                                onRetry = onRetry?.let { retry ->
                                    { retry(RescueOverviewSection.MY_TASKS) }
                                }
                            )
                            OverviewAction("Xem nhiệm vụ", canOpen(RescueOverviewDestination.MY_TASKS)) {
                                openDestination(RescueOverviewDestination.MY_TASKS)
                            }
                        }
                    }
                    item(key = "quick-access") {
                        OverviewPanel("Truy cập nhanh") {
                            listOf(
                                "Điểm an toàn" to RescueOverviewDestination.SAFE_LOCATIONS,
                                "Lịch sử cứu hộ" to RescueOverviewDestination.HISTORY,
                                "Cảnh báo lũ" to RescueOverviewDestination.WARNINGS
                            ).forEach { (title, destination) ->
                                OverviewAction(title, canOpen(destination)) { openDestination(destination) }
                            }
                            logoutError?.let { OverviewLabel(it, 13.sp, OverviewRed) }
                            OutlinedButton(
                                onClick = logout,
                                enabled = !isLoggingOut,
                                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.dp, OverviewBorder)
                            ) {
                                OverviewLabel(if (isLoggingOut) "Đang đăng xuất…" else "Đăng xuất", 13.sp, OverviewCyan)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OverviewPanel(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = OverviewSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OverviewLabel(title, 16.sp, weight = FontWeight.SemiBold)
            content()
        }
    }
}

@Composable
private fun SummaryTile(
    metric: RescueSummaryMetric,
    state: RescueSummaryState,
    modifier: Modifier,
    canOpen: Boolean,
    onOpen: () -> Unit,
    onRetry: (() -> Unit)?
) {
    val accent = when (metric) {
        RescueSummaryMetric.NEW_SOS -> OverviewRed
        RescueSummaryMetric.IN_PROGRESS -> OverviewCyan
        else -> OverviewGreen
    }
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = OverviewSurface)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().heightIn(min = 156.dp).padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OverviewLabel(metric.title, 12.sp, OverviewMuted, FontWeight.SemiBold)
            when (state) {
                RescueSummaryState.NotReady -> {
                    OverviewLabel("—", 28.sp, accent, FontWeight.Bold)
                    OverviewLabel("Chưa có dữ liệu", 11.sp, OverviewMuted)
                }
                RescueSummaryState.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = accent, strokeWidth = 2.dp)
                    OverviewLabel("Đang tải…", 11.sp, OverviewMuted)
                }
                RescueSummaryState.Empty -> OverviewLabel("Không có kết quả", 14.sp, OverviewMuted)
                is RescueSummaryState.Failed -> {
                    OverviewLabel("Không thể tải", 14.sp, OverviewRed, FontWeight.SemiBold)
                    OverviewLabel(state.message, 11.sp, OverviewMuted)
                    if (onRetry != null) TextButton(onClick = onRetry) { OverviewLabel("Thử lại", 12.sp, OverviewCyan) }
                }
                is RescueSummaryState.Value -> OverviewLabel(state.count.toString(), 28.sp, accent, FontWeight.Bold)
            }
            OverviewLabel("Phạm vi: ${metric.scope}", 10.sp, OverviewMuted)
            if (canOpen) TextButton(onClick = onOpen) { OverviewLabel("Xem danh sách", 11.sp, OverviewCyan) }
        }
    }
}

@Composable
private fun SectionStatus(
    state: RescueOverviewSectionState,
    pendingMessage: String,
    onRetry: (() -> Unit)? = null
) {
    when (state) {
        RescueOverviewSectionState.NotReady -> OverviewLabel(pendingMessage, 13.sp, OverviewMuted)
        RescueOverviewSectionState.Loading -> Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = OverviewCyan, strokeWidth = 2.dp)
            OverviewLabel("Đang tải…", 13.sp, OverviewMuted)
        }
        is RescueOverviewSectionState.Empty -> OverviewLabel(state.message, 13.sp, OverviewMuted)
        is RescueOverviewSectionState.Failed -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            OverviewLabel("Không thể tải dữ liệu", 13.sp, OverviewRed, FontWeight.SemiBold)
            OverviewLabel(state.message, 12.sp, OverviewMuted)
            if (onRetry != null) TextButton(onClick = onRetry) { OverviewLabel("Thử lại", 12.sp, OverviewCyan) }
        }
    }
}

@Composable
private fun OverviewAction(
    label: String,
    enabled: Boolean,
    primary: Boolean = false,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (primary) OverviewGreen else OverviewAlternate,
            contentColor = if (primary) OverviewBackground else OverviewCyan,
            disabledContainerColor = OverviewAlternate,
            disabledContentColor = OverviewMuted
        )
    ) {
        OverviewLabel(
            if (enabled) label else "$label · Sắp có",
            13.sp,
            if (!enabled) OverviewMuted else if (primary) OverviewBackground else OverviewCyan,
            FontWeight.SemiBold
        )
    }
}

@Composable
private fun OverviewLabel(
    text: String,
    size: TextUnit = 14.sp,
    color: Color = OverviewText,
    weight: FontWeight = FontWeight.Normal
) {
    Text(
        text = text,
        fontFamily = OverviewFont,
        fontSize = size,
        lineHeight = size * 1.5f,
        fontWeight = weight,
        color = color
    )
}

// Preview fixtures are isolated from the production defaults above.
@Preview(name = "Overview / Pending", widthDp = 390, heightDp = 844)
@Composable
private fun RescueOverviewPendingPreview() {
    RescueOverviewScreen(onLogout = { Result.success(Unit) }, onLoggedOut = {})
}

@Preview(name = "Overview / Partial loading and failure", widthDp = 390, heightDp = 844)
@Composable
private fun RescueOverviewPartialPreview() {
    RescueOverviewScreen(
        onLogout = { Result.success(Unit) },
        onLoggedOut = {},
        uiState = RescueOverviewUiState(
            summaries = mapOf(
                RescueSummaryMetric.NEW_SOS to RescueSummaryState.Loading,
                RescueSummaryMetric.IN_PROGRESS to RescueSummaryState.Failed("Không có kết nối mạng."),
                RescueSummaryMetric.MY_TASKS to RescueSummaryState.Empty,
                RescueSummaryMetric.COMPLETED to RescueSummaryState.Value(0)
            ),
            warnings = RescueOverviewSectionState.Empty("Không có cảnh báo trong dữ liệu đã tải.")
        ),
        onRetry = {}
    )
}
