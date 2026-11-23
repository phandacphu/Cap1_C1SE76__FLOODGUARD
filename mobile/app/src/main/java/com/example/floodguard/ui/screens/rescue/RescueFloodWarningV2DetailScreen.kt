package com.example.floodguard.ui.screens.rescue

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.floodguard.R
import com.example.floodguard.data.repository.RescueFloodWarningV2

private val DetailWarningBg = Color(0xFF051424)
private val DetailWarningSurface = Color(0xFF122131)
private val DetailWarningText = Color(0xFFD4E4FA)
private val DetailWarningMuted = Color(0xFFBBC9CD)
private val DetailWarningCyan = Color(0xFF8AEBFF)
private val DetailWarningGreen = Color(0xFF45F797)
private val DetailWarningBorder = Color(0xFF2C3A4C)

private val DetailWarningFont = FontFamily(
    Font(R.font.rescue_be_vietnam_regular, FontWeight.Normal),
    Font(R.font.rescue_be_vietnam_bold, FontWeight.Bold)
)

@Composable
internal fun RescueFloodWarningV2DetailScreen(
    id: String,
    ownerKey: String,
    viewModel: RescueFloodWarningV2ViewModel,
    onBack: () -> Unit,
    onOpenWarningMap: () -> Unit,
    onOverview: () -> Unit,
    onFloodMap: () -> Unit,
    onSos: () -> Unit,
    onSafeLocations: () -> Unit
) {
    val sharedState by viewModel.detailState.collectAsStateWithLifecycle()
    val accessFailure by viewModel.accessFailure.collectAsStateWithLifecycle()

    // Never show data belonging to another navigation entry.
    val state = when {
        accessFailure != null ->
            RescueWarningV2DetailState(
                errorMessage = "Không thể tiếp tục truy cập cảnh báo."
            )

        sharedState.id == id && sharedState.ownerKey == ownerKey ->
            sharedState

        else ->
            RescueWarningV2DetailState(
                id = id,
                ownerKey = ownerKey,
                isLoading = true
            )
    }

    BackHandler(onBack = onBack)

    LaunchedEffect(viewModel, id, ownerKey) {
        viewModel.openDetail(id, ownerKey)
    }

    DisposableEffect(viewModel, id, ownerKey) {
        onDispose {
            viewModel.closeDetail(
                expectedOwner = ownerKey,
                expectedId = id
            )
        }
    }

    val warning = state.warning?.takeIf { it.id == id }

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = DetailWarningCyan,
            onPrimary = DetailWarningBg,
            background = DetailWarningBg,
            onBackground = DetailWarningText,
            surface = DetailWarningSurface,
            onSurface = DetailWarningText
        )
    ) {
        Scaffold(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding(),
            containerColor = DetailWarningBg,
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
                            fontFamily = DetailWarningFont
                        )
                    }

                    Text(
                        text = "Chi tiết cảnh báo",
                        color = DetailWarningText,
                        fontFamily = DetailWarningFont,
                        fontWeight = FontWeight.Bold,
                        fontSize = 19.sp
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
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                if (state.isLoading) {
                    item(key = "loading") {
                        LinearProgressIndicator(
                            modifier = Modifier.fillMaxWidth(),
                            color = DetailWarningCyan
                        )
                    }
                }

                state.errorMessage?.let { message ->
                    item(key = "error") {
                        Column(
                            verticalArrangement =
                                Arrangement.spacedBy(8.dp)
                        ) {
                            DetailWarningNotice(
                                if (state.isStale) {
                                    "Chưa thể cập nhật: $message"
                                } else {
                                    message
                                }
                            )

                            if (
                                !state.notFound &&
                                accessFailure == null
                            ) {
                                OutlinedButton(
                                    onClick = {
                                        viewModel.refreshDetail(ownerKey)
                                    },
                                    enabled = !state.isLoading
                                ) {
                                    Text("Thử lại")
                                }
                            }
                        }
                    }
                }

                if (
                    warning == null &&
                    !state.isLoading &&
                    state.errorMessage == null
                ) {
                    item(key = "no_detail") {
                        DetailWarningNotice(
                            "Chưa có thông tin chi tiết bản tin."
                        )
                    }
                }

                if (warning != null) {
                    item(key = "warning_header") {
                        DetailWarningHeader(warning)
                    }

                    if (!warning.isActive) {
                        item(key = "inactive_notice") {
                            DetailWarningNotice(
                                "Bản tin đã được Admin tắt. " +
                                    "Cảnh báo theo bản tin này đã kết thúc."
                            )
                        }
                    }

                    item(key = "times") {
                        DetailWarningPanel {
                            DetailWarningField(
                                "BẮT ĐẦU · GMT+7",
                                formatRescueWarningTime(warning.startAt)
                            )

                            HorizontalDivider(
                                color = DetailWarningBorder
                            )

                            DetailWarningField(
                                "KẾT THÚC · GMT+7",
                                warning.endAt?.let {
                                    formatRescueWarningTime(it)
                                } ?: "Đang có hiệu lực"
                            )
                        }
                    }

                    item(key = "content") {
                        DetailWarningPanel {
                            Text(
                                text = "Nội dung cảnh báo",
                                color = DetailWarningCyan,
                                fontFamily = DetailWarningFont,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )

                            Text(
                                text = warning.content,
                                color = DetailWarningText,
                                fontFamily = DetailWarningFont,
                                fontSize = 14.sp,
                                lineHeight = 23.sp
                            )
                        }
                    }

                    item(key = "scope") {
                        DetailWarningPanel {
                            Text(
                                text = "Phạm vi áp dụng",
                                color = DetailWarningCyan,
                                fontFamily = DetailWarningFont,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )

                            Text(
                                text = "Toàn bộ các vùng được hệ thống " +
                                    "công bố trên bản đồ.",
                                color = DetailWarningText,
                                fontFamily = DetailWarningFont,
                                fontSize = 14.sp
                            )

                            Text(
                                text = "Bản đồ hiển thị ba lớp: " +
                                    "vùng ngập hiện tại, vùng trũng và vùng ngập lịch sử.",
                                color = DetailWarningMuted,
                                fontFamily = DetailWarningFont,
                                fontSize = 12.sp
                            )

                            if (!warning.isActive) {
                                DetailWarningNotice(
                                    "Bản đồ sử dụng dữ liệu hiện có " +
                                        "của hệ thống, không tái hiện trạng thái " +
                                        "các vùng khi bản tin cảnh báo đã kết thúc."
                                )
                            }

                            Button(
                                onClick = onOpenWarningMap,
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !state.isLoading &&
                                    accessFailure == null
                            ) {
                                Text(
                                    "Xem bản đồ ngập",
                                    fontFamily = DetailWarningFont
                                )
                            }
                        }
                    }

                    item(key = "metadata") {
                        DetailWarningPanel {
                            DetailWarningField(
                                "Nguồn",
                                "Admin FLOODGUARD"
                            )

                            DetailWarningField(
                                "Mã bản tin",
                                warning.id
                            )

                            DetailWarningField(
                                "Cập nhật lần cuối · GMT+7",
                                formatRescueWarningTime(
                                    warning.updatedAt
                                )
                            )
                        }
                    }

                    item(key = "refresh") {
                        OutlinedButton(
                            onClick = {
                                viewModel.refreshDetail(ownerKey)
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !state.isLoading &&
                                accessFailure == null
                        ) {
                            Text("Làm mới bản tin")
                        }
                    }
                }

                item(key = "footer") {
                    Text(
                        text = "Dữ liệu cung cấp để hỗ trợ " +
                            "công tác cứu hộ. " +
                            "Hãy kiểm tra tình hình thực tế.",
                        color = DetailWarningMuted,
                        fontFamily = DetailWarningFont,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun DetailWarningHeader(
    warning: RescueFloodWarningV2
) {
    DetailWarningPanel {
        Text(
            text = if (warning.isActive) {
                "ĐANG BẬT"
            } else {
                "ĐÃ TẮT"
            },
            color = if (warning.isActive) {
                DetailWarningGreen
            } else {
                DetailWarningMuted
            },
            fontFamily = DetailWarningFont,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp
        )

        Text(
            text = warning.title,
            color = DetailWarningText,
            fontFamily = DetailWarningFont,
            fontWeight = FontWeight.Bold,
            fontSize = 22.sp
        )
    }
}

@Composable
private fun DetailWarningPanel(
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = DetailWarningSurface
        ),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(
            1.dp,
            DetailWarningBorder
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(17.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content
        )
    }
}

@Composable
private fun DetailWarningField(
    label: String,
    value: String
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label,
            color = DetailWarningMuted,
            fontFamily = DetailWarningFont,
            fontSize = 12.sp
        )

        Text(
            text = value,
            color = DetailWarningText,
            fontFamily = DetailWarningFont,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp
        )
    }
}

@Composable
private fun DetailWarningNotice(message: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = DetailWarningSurface,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(
            1.dp,
            DetailWarningBorder
        )
    ) {
        Text(
            text = message,
            modifier = Modifier.padding(15.dp),
            color = DetailWarningText,
            fontFamily = DetailWarningFont,
            fontSize = 13.sp,
            lineHeight = 20.sp
        )
    }
}
