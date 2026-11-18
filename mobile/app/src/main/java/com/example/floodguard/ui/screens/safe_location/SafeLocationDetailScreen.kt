package com.example.floodguard.ui.screens.safe_location

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Shield
import com.example.floodguard.domain.model.SafeLocation
import com.example.floodguard.domain.model.SafeLocationFacility
import com.example.floodguard.domain.model.SafeLocationStatus
import com.example.floodguard.ui.components.FloodGuardBottomBar
import com.example.floodguard.ui.navigation.AppRoutes


private val PageBackground = Color(0xFF081827)
private val CardBackground = Color(0xFF15283B)
private val AccentCyan = Color(0xFF39D9E8)
private val MutedText = Color(0xFF9CAFC0)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SafeLocationDetailScreen(
    viewModel: SafeLocationDetailViewModel,
    onBack: () -> Unit = {},
    onNotificationClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
    onDirections: (SafeLocation) -> Unit = {},
    onContactClick: (String) -> Unit = {},
    onBottomNavigate: (String) -> Unit = {}
) {
    val state = viewModel.uiState.collectAsState().value
    val location = state.location

    Scaffold(
        containerColor = PageBackground,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "● HỆ THỐNG SẴN SÀNG • TRỰC TÚC",
                            color = AccentCyan,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )

                        Text(
                            text = "Điểm Tránh Trú An Toàn",
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
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
                            tint = AccentCyan
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = PageBackground,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        bottomBar = {
            FloodGuardBottomBar(
                currentRoute = AppRoutes.SAFE_LOCATION,
                onNavigate = onBottomNavigate
            )
        }
    ) { padding ->

        when {
            state.isLoading && location == null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = AccentCyan)
                }
            }

            state.errorMessage != null && location == null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.errorMessage, color = Color(0xFFFF8585))

                        if (!state.isUnavailable) {
                            TextButton(onClick = viewModel::retry) {
                                Text("Thử lại")
                            }
                        }
                    }
                }
            }

            location == null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Chưa có thông tin địa điểm.",
                        color = MutedText
                    )
                }
            }

            else -> {
                val typeLabel = when (location.type) {
                    "shelter" -> "Điểm tránh trú"
                    "school" -> "Trường học"
                    "hospital" -> "Bệnh viện"
                    "community_center" -> "Nhà sinh hoạt cộng đồng"
                    else -> "Khác"
                }
                val hasValidCoordinates =
                    location.latitude in -90.0..90.0 &&
                            location.longitude in -180.0..180.0

                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    state.errorMessage?.let { message ->
                        item {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = message,
                                    color = Color(0xFFFF8585),
                                    modifier = Modifier.weight(1f)
                                )
                                TextButton(onClick = viewModel::retry) {
                                    Text("Thử lại")
                                }
                            }
                        }
                    }
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = CardBackground
                            )
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = location.name,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 20.sp
                                )
                                Text(location.address, color = MutedText)
                                Text(typeLabel, color = AccentCyan)

                                if (hasValidCoordinates) {
                                    Text(
                                        text = "Vĩ độ ${location.latitude} · Kinh độ ${location.longitude}",
                                        color = MutedText
                                    )
                                }

                                location.distanceKm?.let { distance ->
                                    Text(
                                        text = String.format(
                                            java.util.Locale.forLanguageTag("vi-VN"),
                                            "Cách bạn khoảng %.2f km",
                                            distance
                                        ),
                                        color = AccentCyan
                                    )
                                }

                                if (location.description.isNotBlank()) {
                                    Text(location.description, color = Color.White)
                                }
                            }
                        }
                    }

                    item {
                        Button(
                            onClick = { onDirections(location) },
                            enabled = !state.isMockData && hasValidCoordinates,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = AccentCyan,
                                contentColor = PageBackground
                            )
                        ) {
                            Text("Chỉ đường")
                        }
                    }
                }
            }
        }
    }
}