package com.example.floodguard.ui.screens.warning

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.floodguard.ui.components.FloodGuardBottomBar
import com.example.floodguard.ui.navigation.AppRoutes

// =====================================================
// COLORS
// =====================================================

private val WarningDetailBackground = Color(0xFF06111F)
private val WarningDetailCard = Color(0xFF0A1626)
private val WarningDetailBorder = Color(0xFF1B2D45)

private val WarningDetailText = Color(0xFFF2F4F8)
private val WarningDetailSecondary = Color(0xFFB8C1CC)

private val WarningDetailBlue = Color(0xFF18C8FF)
private val WarningDetailRed = Color(0xFFFF5252)


// =====================================================
// ROUTE
// =====================================================

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

    val detail = uiState.warningDetail ?: return

    WarningDetailScreen(
        detail = detail,
        onBack = onBack,
        onNotificationClick = onNotificationClick,
        onProfileClick = onProfileClick,
        onFloodMapClick = onFloodMapClick,
        onSafeLocationClick = onSafeLocationClick,
        onSosClick = onSosClick,
        onBottomNavigate = onBottomNavigate
    )
}


// =====================================================
// MAIN SCREEN
// =====================================================

@Composable
fun WarningDetailScreen(
    detail: WarningDetail,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit,
    onProfileClick: () -> Unit,
    onFloodMapClick: () -> Unit = {},
    onSafeLocationClick: () -> Unit = {},
    onSosClick: () -> Unit = {},
    onBottomNavigate: (String) -> Unit = {}
) {

    Scaffold(
        containerColor = WarningDetailBackground,

        bottomBar = {
            FloodGuardBottomBar(
                currentRoute = AppRoutes.HOME,
                onNavigate = onBottomNavigate
            )
        }
    ) { innerPadding ->

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(WarningDetailBackground)
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
        ) {

            // =========================
            // HEADER
            // =========================

            WarningDetailHeader(
                detail = detail,
                onBack = onBack,
                onNotificationClick = onNotificationClick,
                onProfileClick = onProfileClick
            )

            Spacer(
                modifier = Modifier.height(12.dp)
            )

            // =========================
            // MAIN WARNING
            // =========================

            WarningMainCard(
                detail = detail
            )

            Spacer(
                modifier = Modifier.height(24.dp)
            )

            // =====================================================
            // SECTION 1
            // =====================================================

            WarningSectionTitle(
                number = "1",
                title = "KHU VỰC VÀ PHẠM VI ẢNH HƯỞNG"
            )

            Spacer(
                modifier = Modifier.height(12.dp)
            )

            WarningImpactCard(
                detail = detail
            )

            Spacer(
                modifier = Modifier.height(24.dp)
            )

            // =====================================================
            // SECTION 2
            // =====================================================

            WarningSectionTitle(
                number = "2",
                title = "CHỈ SỐ ĐO ĐẠC & QUAN TRẮC THỰC ĐỊA"
            )

            Spacer(
                modifier = Modifier.height(12.dp)
            )

            WarningMetricsSection(
                detail = detail
            )

            Spacer(
                modifier = Modifier.height(24.dp)
            )

            // =====================================================
            // SECTION 3
            // =====================================================

            WarningSectionTitle(
                number = "3",
                title = "NGUY CƠ & ĐỊA ĐIỂM CHÚ Ý"
            )

            Spacer(
                modifier = Modifier.height(12.dp)
            )

            WarningRiskSection(
                detail = detail
            )

            Spacer(
                modifier = Modifier.height(24.dp)
            )

            // =====================================================
            // SECTION 4
            // =====================================================

            WarningSectionTitle(
                number = "4",
                title = "HƯỚNG DẪN HÀNH ĐỘNG DÀNH CHO CƯ DÂN"
            )

            Spacer(
                modifier = Modifier.height(12.dp)
            )

            WarningSafetyCard(
                detail = detail
            )

            Spacer(
                modifier = Modifier.height(24.dp)
            )

            // =====================================================
            // QUICK ACTIONS
            // =====================================================

            WarningQuickActions(
                onFloodMapClick = onFloodMapClick,
                onSafeLocationClick = onSafeLocationClick,
                onSosClick = onSosClick
            )

            Spacer(
                modifier = Modifier.height(24.dp)
            )

            // =====================================================
            // SOURCE
            // =====================================================

            Text(
                text = detail.sourceInfo,
                color = WarningDetailSecondary,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
            )

            Spacer(
                modifier = Modifier.height(24.dp)
            )
        }
    }
}


// =====================================================
// HEADER
// =====================================================

@Composable
private fun WarningDetailHeader(
    detail: WarningDetail,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit,
    onProfileClick: () -> Unit
) {

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(
                horizontal = 10.dp,
                vertical = 8.dp
            )
    ) {

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {

            IconButton(
                onClick = onBack
            ) {

                Icon(
                    imageVector = Icons.Outlined.ArrowBack,
                    contentDescription = "Quay lại",
                    tint = WarningDetailText
                )
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 4.dp)
            ) {

                Text(
                    text = detail.systemStatus,
                    color = WarningDetailText,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium
                )

                Spacer(
                    modifier = Modifier.height(3.dp)
                )

                Text(
                    text = detail.screenTitle,
                    color = WarningDetailText,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
            }

            IconButton(
                onClick = onNotificationClick
            ) {

                Icon(
                    imageVector = Icons.Outlined.Notifications,
                    contentDescription = "Thông báo",
                    tint = WarningDetailText
                )
            }

            IconButton(
                onClick = onProfileClick
            ) {

                Icon(
                    imageVector = Icons.Outlined.AccountCircle,
                    contentDescription = "Hồ sơ",
                    tint = WarningDetailText
                )
            }
        }
    }
}


// =====================================================
// MAIN WARNING CARD
// =====================================================

@Composable
private fun WarningMainCard(
    detail: WarningDetail
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),

        shape = RoundedCornerShape(18.dp),

        colors = CardDefaults.cardColors(
            containerColor = WarningDetailCard
        ),

        border = BorderStroke(
            width = 1.dp,
            color = WarningDetailBorder
        )
    ) {

        Column(
            modifier = Modifier.padding(18.dp)
        ) {

            // LEVEL

            Text(
                text = "▲ ${detail.levelText}",
                color = WarningDetailText,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            Spacer(
                modifier = Modifier.height(14.dp)
            )

            // TIME

            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {

                Icon(
                    imageVector = Icons.Outlined.AccessTime,
                    contentDescription = null,
                    tint = WarningDetailSecondary,
                    modifier = Modifier.size(18.dp)
                )

                Spacer(
                    modifier = Modifier.width(6.dp)
                )

                Text(
                    text = "${detail.updatedTime} • ${detail.updatedAgo}",
                    color = WarningDetailSecondary,
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            Spacer(
                modifier = Modifier.height(16.dp)
            )

            // BULLETIN

            Text(
                text = "BẢN TIN SỐ: ${detail.bulletinNo}",
                color = WarningDetailSecondary,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Medium
            )

            Spacer(
                modifier = Modifier.height(14.dp)
            )

            // TITLE

            Text(
                text = detail.headline,
                color = WarningDetailText,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            Spacer(
                modifier = Modifier.height(18.dp)
            )

            // LOCATION

            Row(
                verticalAlignment = Alignment.Top
            ) {

                Icon(
                    imageVector = Icons.Outlined.LocationOn,
                    contentDescription = null,
                    tint = WarningDetailText,
                    modifier = Modifier.size(22.dp)
                )

                Spacer(
                    modifier = Modifier.width(8.dp)
                )

                Text(
                    text = detail.locationSummary,
                    color = WarningDetailText,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(
                modifier = Modifier.height(20.dp)
            )

            // DESCRIPTION

            Text(
                text = detail.description,
                color = WarningDetailText,
                style = MaterialTheme.typography.bodyLarge
            )
        }
    }
}


// =====================================================
// SECTION TITLE
// =====================================================

@Composable
private fun WarningSectionTitle(
    number: String,
    title: String
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),

        verticalAlignment = Alignment.CenterVertically
    ) {

        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(WarningDetailBlue),

            contentAlignment = Alignment.Center
        ) {

            Text(
                text = number,
                color = Color.Black,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(
            modifier = Modifier.width(10.dp)
        )

        Text(
            text = title,
            color = WarningDetailText,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f)
        )
    }
}


// =====================================================
// SECTION 1 - IMPACT AREA
// =====================================================

@Composable
private fun WarningImpactCard(
    detail: WarningDetail
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),

        shape = RoundedCornerShape(16.dp),

        colors = CardDefaults.cardColors(
            containerColor = WarningDetailCard
        ),

        border = BorderStroke(
            1.dp,
            WarningDetailBorder
        )
    ) {

        Column(
            modifier = Modifier.padding(16.dp)
        ) {

            WarningInfoBlock(
                label = "ĐỊA BÀN TRỌNG YẾU",
                value = detail.keyAreas
            )

            Spacer(
                modifier = Modifier.height(20.dp)
            )

            WarningInfoBlock(
                label = "LƯU VỰC THỦY VĂN",
                value = detail.basinInfo
            )

            Spacer(
                modifier = Modifier.height(20.dp)
            )

            Text(
                text = "KHUNG GIỜ ĐỈNH LŨ",
                color = WarningDetailSecondary,
                style = MaterialTheme.typography.labelMedium
            )

            Spacer(
                modifier = Modifier.height(8.dp)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {

                Text(
                    text = detail.peakWindow,
                    color = WarningDetailText,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )

                Spacer(
                    modifier = Modifier.width(10.dp)
                )

                Text(
                    text = detail.peakWindowNote,
                    color = WarningDetailSecondary,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}


@Composable
private fun WarningInfoBlock(
    label: String,
    value: String
) {

    Column {

        Text(
            text = label,
            color = WarningDetailSecondary,
            style = MaterialTheme.typography.labelMedium
        )

        Spacer(
            modifier = Modifier.height(6.dp)
        )

        Text(
            text = value,
            color = WarningDetailText,
            style = MaterialTheme.typography.bodyLarge
        )
    }
}


// =====================================================
// SECTION 2 - METRICS
// =====================================================

@Composable
private fun WarningMetricsSection(
    detail: WarningDetail
) {

    Column(
        modifier = Modifier.padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {

            WarningMetricCard(
                title = "MƯA TÍCH LŨY (6H)",
                value = detail.rainfall6h,
                note = detail.rainfallNote,
                modifier = Modifier.weight(1f)
            )

            WarningMetricCard(
                title = "MỰC NƯỚC HIỆN TẠI",
                value = detail.currentWaterLevel,
                note = detail.currentWaterLevelNote,
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {

            WarningMetricCard(
                title = "XẢ QUA TRÀN",
                value = detail.spillDischarge,
                note = detail.spillDischargeNote,
                modifier = Modifier.weight(1f)
            )

            WarningMetricCard(
                title = "ĐỘ SÂU DỰ KIẾN",
                value = detail.floodDepthForecast,
                note = detail.floodDepthForecastNote,
                modifier = Modifier.weight(1f)
            )
        }
    }
}


@Composable
private fun WarningMetricCard(
    title: String,
    value: String,
    note: String,
    modifier: Modifier = Modifier
) {

    Card(
        modifier = modifier,

        shape = RoundedCornerShape(14.dp),

        colors = CardDefaults.cardColors(
            containerColor = WarningDetailCard
        ),

        border = BorderStroke(
            1.dp,
            WarningDetailBorder
        )
    ) {

        Column(
            modifier = Modifier.padding(14.dp)
        ) {

            Text(
                text = title,
                color = WarningDetailSecondary,
                style = MaterialTheme.typography.labelSmall
            )

            Spacer(
                modifier = Modifier.height(8.dp)
            )

            Text(
                text = value,
                color = WarningDetailText,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            Spacer(
                modifier = Modifier.height(8.dp)
            )

            Text(
                text = note,
                color = WarningDetailSecondary,
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}


// =====================================================
// SECTION 3 - RISKS
// =====================================================

@Composable
private fun WarningRiskSection(
    detail: WarningDetail
) {

    Column(
        modifier = Modifier.padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {

        WarningRiskCard(
            number = "01",
            title = "TUYẾN ĐƯỜNG CÓ NGUY CƠ CHIA CẮT",
            description = detail.riskyRoads
        )

        WarningRiskCard(
            number = "02",
            title = "KHU DÂN CƯ NGẬP LỤT SÂU",
            description = detail.floodedResidentialAreas
        )

        WarningRiskCard(
            number = "03",
            title = "NGUY CƠ SẠT LỞ BỜ SÔNG",
            description = detail.riverbankLandslideRisk
        )
    }
}


@Composable
private fun WarningRiskCard(
    number: String,
    title: String,
    description: String
) {

    Card(
        modifier = Modifier.fillMaxWidth(),

        shape = RoundedCornerShape(15.dp),

        colors = CardDefaults.cardColors(
            containerColor = WarningDetailCard
        ),

        border = BorderStroke(
            1.dp,
            WarningDetailBorder
        )
    ) {

        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.Top
        ) {

            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        WarningDetailRed.copy(alpha = 0.15f)
                    ),

                contentAlignment = Alignment.Center
            ) {

                Text(
                    text = number,
                    color = WarningDetailRed,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(
                modifier = Modifier.width(14.dp)
            )

            Column(
                modifier = Modifier.weight(1f)
            ) {

                Text(
                    text = title,
                    color = WarningDetailText,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )

                Spacer(
                    modifier = Modifier.height(8.dp)
                )

                Text(
                    text = description,
                    color = WarningDetailSecondary,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}


// =====================================================
// SECTION 4 - SAFETY
// =====================================================

@Composable
private fun WarningSafetyCard(
    detail: WarningDetail
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),

        shape = RoundedCornerShape(16.dp),

        colors = CardDefaults.cardColors(
            containerColor = WarningDetailCard
        ),

        border = BorderStroke(
            1.dp,
            WarningDetailBorder
        )
    ) {

        Column(
            modifier = Modifier.padding(16.dp)
        ) {

            detail.safetyGuides.forEachIndexed { index, guide ->

                WarningSafetyItem(
                    number = index + 1,
                    text = guide
                )

                if (index != detail.safetyGuides.lastIndex) {

                    Spacer(
                        modifier = Modifier.height(14.dp)
                    )
                }
            }

            Spacer(
                modifier = Modifier.height(20.dp)
            )

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(
                        RoundedCornerShape(12.dp)
                    )
                    .background(
                        WarningDetailRed.copy(alpha = 0.08f)
                    )
                    .border(
                        width = 1.dp,
                        color = WarningDetailRed.copy(alpha = 0.55f),
                        shape = RoundedCornerShape(12.dp)
                    )
                    .padding(14.dp)
            ) {

                Text(
                    text = detail.emergencyNote,
                    color = WarningDetailText,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}


@Composable
private fun WarningSafetyItem(
    number: Int,
    text: String
) {

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {

        Box(
            modifier = Modifier
                .size(26.dp)
                .clip(CircleShape)
                .background(
                    WarningDetailBlue.copy(alpha = 0.18f)
                ),

            contentAlignment = Alignment.Center
        ) {

            Text(
                text = number.toString(),
                color = WarningDetailBlue,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(
            modifier = Modifier.width(12.dp)
        )

        Text(
            text = text,
            color = WarningDetailText,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f)
        )
    }
}


// =====================================================
// QUICK ACTIONS
// =====================================================

@Composable
private fun WarningQuickActions(
    onFloodMapClick: () -> Unit,
    onSafeLocationClick: () -> Unit,
    onSosClick: () -> Unit
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),

        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {

        WarningActionButton(
            text = "BẢN ĐỒ\nNGẬP",
            onClick = onFloodMapClick,
            modifier = Modifier.weight(1f)
        )

        WarningActionButton(
            text = "ĐIỂM\nTRÁNH TRÚ",
            onClick = onSafeLocationClick,
            modifier = Modifier.weight(1f)
        )

        OutlinedButton(
            onClick = onSosClick,

            modifier = Modifier
                .weight(1f)
                .height(76.dp),

            shape = RoundedCornerShape(15.dp),

            border = BorderStroke(
                1.dp,
                WarningDetailRed
            ),

            colors = ButtonDefaults.outlinedButtonColors(
                containerColor = WarningDetailCard,
                contentColor = WarningDetailText
            )
        ) {

            Text(
                text = "GỬI\nSOS",
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Bold
            )
        }
    }
}


@Composable
private fun WarningActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {

    OutlinedButton(
        onClick = onClick,

        modifier = modifier.height(76.dp),

        shape = RoundedCornerShape(15.dp),

        border = BorderStroke(
            1.dp,
            WarningDetailBorder
        ),

        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = WarningDetailCard,
            contentColor = WarningDetailText
        )
    ) {

        Text(
            text = text,
            textAlign = TextAlign.Center,
            fontWeight = FontWeight.Bold
        )
    }
}
