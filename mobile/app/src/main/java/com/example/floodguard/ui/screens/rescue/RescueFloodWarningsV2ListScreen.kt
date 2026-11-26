package com.example.floodguard.ui.screens.rescue

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.floodguard.R
import com.example.floodguard.data.repository.RescueFloodWarningV2
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

private val WarningBg = Color(0xFF051424)
private val WarningSurface = Color(0xFF122131)
private val WarningText = Color(0xFFD4E4FA)
private val WarningMuted = Color(0xFFBBC9CD)
private val WarningCyan = Color(0xFF8AEBFF)
private val WarningGreen = Color(0xFF45F797)
private val WarningBorder = Color(0xFF2C3A4C)

private val WarningFont = FontFamily(
    Font(R.font.rescue_be_vietnam_regular, FontWeight.Normal),
    Font(R.font.rescue_be_vietnam_bold, FontWeight.Bold)
)

private val WarningDateFormatter =
    DateTimeFormatter.ofPattern(
        "dd/MM/yyyy · HH:mm",
        Locale("vi", "VN")
    ).withZone(ZoneId.of("Asia/Ho_Chi_Minh"))

internal fun formatRescueWarningTime(time: Instant): String =
    WarningDateFormatter.format(time)

@Composable
internal fun RescueFloodWarningsV2ListScreen(
    viewModel: RescueFloodWarningV2ViewModel,
    onBack: () -> Unit,
    onOpenDetail: (String) -> Unit,
    onOverview: () -> Unit,
    onFloodMap: () -> Unit,
    onSos: () -> Unit,
    onSafeLocations: () -> Unit
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()

    var searchInput by rememberSaveable {
        mutableStateOf(viewModel.listState.value.query)
    }

    BackHandler(onBack = onBack)

    LaunchedEffect(viewModel) {
        viewModel.onListEntered()
    }

    // Do not call API on every keystroke or recomposition.
    LaunchedEffect(viewModel, searchInput) {
        delay(350)
        if (viewModel.listState.value.query != searchInput) {
            viewModel.updateQuery(searchInput)
        }
    }

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = WarningCyan,
            onPrimary = WarningBg,
            background = WarningBg,
            onBackground = WarningText,
            surface = WarningSurface,
            onSurface = WarningText
        )
    ) {
        Scaffold(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding(),
            containerColor = WarningBg,
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            topBar = {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = 12.dp,
                            vertical = 8.dp
                        ),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(onClick = onBack) {
                        Text(
                            "Quay lại",
                            fontFamily = WarningFont
                        )
                    }

                    Text(
                        text = "Cảnh báo lũ",
                        color = WarningText,
                        fontFamily = WarningFont,
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp
                    )
                }
            },
            bottomBar = {
                RescueBottomBar(
                    selectedTab = RescueMainTab.OVERVIEW,
                    onOverview = onOverview,
                    onMap = onFloodMap,
                    onSos = onSos,
                    onSafeLocations = onSafeLocations
                )
            }
        ) { padding ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item(key = "heading") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement =
                            Arrangement.spacedBy(8.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Danh sách cảnh báo",
                                color = WarningText,
                                fontSize = 19.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = WarningFont
                            )

                            Text(
                                text = "Nguồn: Admin FLOODGUARD",
                                color = WarningMuted,
                                fontSize = 12.sp,
                                fontFamily = WarningFont
                            )
                        }

                        OutlinedButton(
                            onClick = viewModel::refreshList,
                            enabled = !state.isLoading
                        ) {
                            Text("Làm mới")
                        }
                    }
                }

                item(key = "intro") {
                    WarningV2Notice(
                        "Các bản tin áp dụng cho toàn bộ vùng " +
                            "được hệ thống công bố trên bản đồ. " +
                            "Cứu hộ chỉ xem thông tin, không quản lý bản tin."
                    )
                }

                item(key = "search") {
                    OutlinedTextField(
                        value = searchInput,
                        onValueChange = { searchInput = it },
                        label = {
                            Text("Tìm theo tiêu đề hoặc nội dung")
                        },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    )
                }

                item(key = "filters") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement =
                            Arrangement.spacedBy(6.dp)
                    ) {
                        RescueWarningV2Filter.entries.forEach { filter ->
                            FilterChip(
                                selected = state.filter == filter,
                                onClick = {
                                    viewModel.selectFilter(filter)
                                },
                                label = {
                                    Text(
                                        when (filter) {
                                            RescueWarningV2Filter.ALL ->
                                                "Tất cả"
                                            RescueWarningV2Filter.ACTIVE ->
                                                "Đang bật"
                                            RescueWarningV2Filter.INACTIVE ->
                                                "Đã tắt"
                                        },
                                        maxLines = 1,
                                        fontSize = 12.sp
                                    )
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }

                if (state.isLoading) {
                    item(key = "loading") {
                        LinearProgressIndicator(
                            modifier = Modifier.fillMaxWidth(),
                            color = WarningCyan
                        )
                    }
                }

                if (state.hasLoaded) {
                    item(key = "count") {
                        Text(
                            text = "${state.warnings.size} bản tin",
                            color = WarningCyan,
                            fontSize = 13.sp,
                            fontFamily = WarningFont
                        )
                    }
                }

                state.errorMessage?.let { error ->
                    item(key = "error") {
                        Column(
                            verticalArrangement =
                                Arrangement.spacedBy(8.dp)
                        ) {
                            WarningV2Notice(
                                if (state.hasLoaded) {
                                    "Chưa thể cập nhật: $error"
                                } else {
                                    error
                                }
                            )

                            OutlinedButton(
                                onClick = viewModel::refreshList
                            ) {
                                Text("Thử lại")
                            }
                        }
                    }
                }

                if (
                    state.isStale &&
                    state.hasLoaded &&
                    state.errorMessage == null
                ) {
                    item(key = "stale") {
                        WarningV2Notice(
                            "Đang cập nhật. Dữ liệu hiển thị " +
                                "là lần tải trước."
                        )
                    }
                }

                if (
                    state.hasLoaded &&
                    !state.isLoading &&
                    state.warnings.isEmpty() &&
                    state.errorMessage == null
                ) {
                    item(key = "empty") {
                        WarningV2Notice(
                            "Không có bản tin phù hợp. " +
                                "Thử trạng thái khác hoặc làm mới."
                        )
                    }
                }

                itemsIndexed(
                    items = state.warnings,
                    key = { index, item -> "${index}:${item.id}" }
                ) { _, warning ->
                    RescueWarningV2Card(
                        warning = warning,
                        onOpenDetail = {
                            onOpenDetail(warning.id)
                        }
                    )
                }

                item(key = "footer") {
                    Text(
                        text = "Thông tin vùng và bản tin dùng " +
                            "để hỗ trợ công tác cứu hộ. " +
                            "Hãy đối chiếu tình hình thực tế.",
                        color = WarningMuted,
                        fontSize = 12.sp,
                        fontFamily = WarningFont
                    )
                }
            }
        }
    }
}

@Composable
private fun RescueWarningV2Card(
    warning: RescueFloodWarningV2,
    onOpenDetail: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = WarningSurface
        ),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, WarningBorder)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement =
                    Arrangement.SpaceBetween
            ) {
                Text(
                    text = if (warning.isActive) {
                        "ĐANG BẬT"
                    } else {
                        "ĐÃ TẮT"
                    },
                    color = if (warning.isActive) {
                        WarningGreen
                    } else {
                        WarningMuted
                    },
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = WarningFont
                )

                Text(
                    text = "ADMIN FLOODGUARD",
                    color = WarningMuted,
                    fontSize = 10.sp,
                    fontFamily = WarningFont
                )
            }

            Text(
                text = warning.title,
                color = WarningText,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = WarningFont
            )

            Text(
                text = warning.content.trim(),
                color = WarningMuted,
                fontSize = 13.sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                fontFamily = WarningFont
            )

            Text(
                text = "Bắt đầu: " +
                    formatRescueWarningTime(warning.startAt) +
                    " GMT+7",
                color = WarningMuted,
                fontSize = 12.sp,
                fontFamily = WarningFont
            )

            Text(
                text = if (warning.endAt == null) {
                    "Kết thúc: Đang có hiệu lực"
                } else {
                    "Kết thúc: " +
                        formatRescueWarningTime(warning.endAt) +
                        " GMT+7"
                },
                color = WarningMuted,
                fontSize = 12.sp,
                fontFamily = WarningFont
            )

            Text(
                text = "Phạm vi: Toàn bộ vùng trên bản đồ",
                color = WarningCyan,
                fontSize = 12.sp,
                fontFamily = WarningFont
            )

            HorizontalDivider(color = WarningBorder)

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement =
                    Arrangement.SpaceBetween
            ) {
                Text(
                    text = if (warning.isActive) {
                        "Theo dõi cập nhật"
                    } else {
                        "Bản tin đã kết thúc"
                    },
                    color = WarningMuted,
                    fontSize = 11.sp,
                    fontFamily = WarningFont,
                    modifier = Modifier.weight(1f)
                )

                TextButton(onClick = onOpenDetail) {
                    Text("Xem chi tiết")
                }
            }
        }
    }
}

@Composable
private fun WarningV2Notice(message: String) {
    Surface(
        color = WarningSurface,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, WarningBorder)
    ) {
        Text(
            text = message,
            modifier = Modifier
                .fillMaxWidth()
                .padding(15.dp),
            color = WarningText,
            fontFamily = WarningFont,
            fontSize = 13.sp
        )
    }
}
