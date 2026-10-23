package com.example.floodguard.ui.screens.safe_location

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.floodguard.domain.model.SafeLocation
import com.example.floodguard.ui.components.SafeLocationCard
import com.example.floodguard.ui.components.FloodGuardBottomBar
import com.example.floodguard.ui.navigation.AppRoutes

private val PageBackground = Color(0xFF081827)
private val SectionBackground = Color(0xFF15283B)
private val AccentCyan = Color(0xFF39D9E8)
private val MutedText = Color(0xFF9CAFC0)

@Composable
fun SafeLocationListScreen(
    onBack: () -> Unit = {},
    onMapClick: () -> Unit = {},
    onNotificationClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
    onViewDetail: (String) -> Unit = {},
    onDirections: (SafeLocation) -> Unit = {},
    onBottomNavigate: (String) -> Unit = {},
    viewModel: SafeLocationViewModel = viewModel()
) {
    val state = viewModel.uiState.collectAsState().value

    Scaffold(
        containerColor = PageBackground,

        topBar = {
            SafeLocationHeader(
                onBack = onBack,
                onNotificationClick = onNotificationClick,
                onProfileClick = onProfileClick
            )
        },

        bottomBar = {
            FloodGuardBottomBar(
                currentRoute = AppRoutes.SAFE_LOCATION,
                onNavigate = onBottomNavigate
            )
        }
    ) { innerPadding ->

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(
                start = 16.dp,
                end = 16.dp,
                top = 16.dp,
                bottom = 28.dp
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            item {
                GpsInformationCard(state)
            }

            item {
                SafeLocationMapPreview(
                    onMapClick = onMapClick
                )
            }

            item {
                Text(
                    text = "ĐỊA ĐIỂM TRÁNH TRÚ",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp
                )
            }

            item {
                SafeLocationFilters(
                    selectedFilter = state.selectedFilter,
                    onSelectFilter = viewModel::selectFilter
                )
            }

            when {
                state.isLoading -> {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(30.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(
                                color = AccentCyan
                            )
                        }
                    }
                }

                state.errorMessage != null -> {
                    item {
                        Text(
                            text = state.errorMessage,
                            color = Color(0xFFFF8585)
                        )
                    }
                }

                state.locations.isEmpty() -> {
                    item {
                        Text(
                            text = "Không có điểm tránh trú phù hợp.",
                            color = MutedText,
                            modifier = Modifier.padding(16.dp)
                        )
                    }
                }

                else -> {
                    items(
                        items = state.locations,
                        key = { it.id }
                    ) { location ->

                        SafeLocationCard(
                            location = location,
                            onViewDetail = onViewDetail,
                            onDirections = onDirections
                        )
                    }
                }
            }

            item {
                EmergencySupportCard()
            }

            item {
                Text(
                    text = "DỮ LIỆU MINH HỌA — KHÔNG DÙNG ĐỂ QUYẾT ĐỊNH SƠ TÁN",
                    color = MutedText,
                    fontSize = 11.sp
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SafeLocationHeader(
    onBack: () -> Unit,
    onNotificationClick: () -> Unit,
    onProfileClick: () -> Unit
) {
    TopAppBar(
        title = {
            Column {
                Text(
                    text = "Điểm Tránh Trú An Toàn",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    maxLines = 1
                )

                Text(
                    text = "FloodGuard • Dữ liệu mẫu",
                    fontSize = 10.sp,
                    color = MutedText
                )
            }
        },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Quay lại"
                )
            }
        },
        actions = {
            IconButton(onClick = onNotificationClick) {
                Icon(
                    imageVector = Icons.Default.Notifications,
                    contentDescription = "Thông báo",
                    tint = Color.White
                )
            }

            IconButton(onClick = onProfileClick) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = "Hồ sơ",
                    tint = Color.White
                )
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = PageBackground,
            titleContentColor = Color.White,
            navigationIconContentColor = Color.White
        )
    )
}

@Composable
private fun GpsInformationCard(
    state: SafeLocationUiState
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = SectionBackground
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = AccentCyan
                )

                Text(
                    text = "VỊ TRÍ HIỆN TẠI",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = AccentCyan
                )
            }

            Text(
                text = state.currentAddress,
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium
            )

            Text(
                text = state.gpsAccuracyMeters?.let {
                    "Độ chính xác GPS: ${it.toInt()} m"
                } ?: "Chưa có dữ liệu GPS thực tế",
                color = MutedText,
                fontSize = 12.sp
            )

            state.lastUpdated?.let {
                Text(
                    text = "Cập nhật: $it",
                    color = MutedText,
                    fontSize = 12.sp
                )
            }
        }
    }
}


@Composable
private fun SafeLocationMapPreview(
    onMapClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(190.dp)
            .clickable(onClick = onMapClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = SectionBackground
        )
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = AccentCyan,
                    modifier = Modifier.size(34.dp)
                )

                Text(
                    text = "XEM BẢN ĐỒ ĐIỂM TRÁNH TRÚ",
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp
                )

                Text(
                    text = "Nhấn để mở Google Maps",
                    color = MutedText,
                    fontSize = 12.sp
                )

                Text(
                    text = "Dữ liệu thử nghiệm • Chưa xác minh",
                    color = MutedText,
                    fontSize = 11.sp
                )
            }
        }
    }
}


@Composable
private fun SafeLocationFilters(
    selectedFilter: SafeLocationFilter,
    onSelectFilter: (SafeLocationFilter) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        FilterButton(
            label = "Tất cả",
            selected = selectedFilter == SafeLocationFilter.ALL,
            onClick = {
                onSelectFilter(SafeLocationFilter.ALL)
            },
            modifier = Modifier.weight(1f)
        )

        FilterButton(
            label = "Gần nhất",
            selected = selectedFilter == SafeLocationFilter.NEAREST,
            onClick = {
                onSelectFilter(SafeLocationFilter.NEAREST)
            },
            modifier = Modifier.weight(1f)
        )

        FilterButton(
            label = "Còn chỗ",
            selected = selectedFilter == SafeLocationFilter.AVAILABLE,
            onClick = {
                onSelectFilter(SafeLocationFilter.AVAILABLE)
            },
            modifier = Modifier.weight(1f)
        )

        FilterButton(
            label = "Có y tế",
            selected = selectedFilter == SafeLocationFilter.MEDICAL,
            onClick = {
                onSelectFilter(SafeLocationFilter.MEDICAL)
            },
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun FilterButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (selected) {
                AccentCyan
            } else {
                SectionBackground
            },
            contentColor = if (selected) {
                PageBackground
            } else {
                Color.White
            }
        ),
        contentPadding = PaddingValues(
            horizontal = 2.dp,
            vertical = 10.dp
        )
    ) {
        Text(
            text = label,
            fontSize = 10.sp,
            maxLines = 1,
            softWrap = false,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun EmergencySupportCard() {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = SectionBackground
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "HỖ TRỢ KHẨN CẤP",
                color = AccentCyan,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp
            )

            Text(
                text = "112 — Tổng đài khẩn cấp",
                color = Color.White,
                fontSize = 14.sp
            )

            Text(
                text = "114 — Phòng cháy chữa cháy & cứu nạn",
                color = Color.White,
                fontSize = 14.sp
            )

            Text(
                text = "Trong tình huống nguy hiểm, hãy liên hệ lực lượng chức năng và làm theo hướng dẫn chính thức.",
                color = MutedText,
                fontSize = 12.sp
            )
        }
    }
}