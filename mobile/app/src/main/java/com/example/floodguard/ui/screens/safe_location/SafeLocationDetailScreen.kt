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
            state.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = AccentCyan)
                }
            }

            state.errorMessage != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = state.errorMessage,
                        color = Color(0xFFFF8585)
                    )
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
                val statusColor = when (location.status) {
                    SafeLocationStatus.AVAILABLE -> Color(0xFF41D69A)
                    SafeLocationStatus.LIMITED -> Color(0xFFFFB84D)
                    SafeLocationStatus.MEDICAL -> AccentCyan
                    SafeLocationStatus.FULL -> Color(0xFFFF7272)
                    SafeLocationStatus.UNKNOWN -> MutedText
                }

                val statusLabel = location.statusDescription.ifBlank {
                    when (location.status) {
                        SafeLocationStatus.AVAILABLE -> "Còn chỗ"
                        SafeLocationStatus.LIMITED -> "Hạn chế tiếp nhận"
                        SafeLocationStatus.MEDICAL -> "Hỗ trợ y tế"
                        SafeLocationStatus.FULL -> "Đã đầy"
                        SafeLocationStatus.UNKNOWN -> "Chưa xác định"
                    }
                }

                val canNavigate = !state.isMockData &&
                        location.isRouteSafe &&
                        location.isAcceptingPeople &&
                        location.capacity > 0 &&
                        location.availableSlots > 0 &&
                        location.latitude != 0.0 &&
                        location.longitude != 0.0

                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    item {
                        Text(
                            text = "DỮ LIỆU MINH HỌA — CHƯA XÁC MINH THỰC TẾ",
                            color = Color(0xFFFFB84D),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    item {
                        DetailCard {
                            Text(
                                text = location.name,
                                color = Color.White,
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Bold
                            )


                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.LocationOn,
                                    contentDescription = null,
                                    tint = AccentCyan,
                                    modifier = Modifier.size(18.dp)
                                )

                                Text(
                                    text = location.address,
                                    color = MutedText,
                                    fontSize = 13.sp
                                )
                            }

                            Text(
                                text = statusLabel,
                                color = statusColor,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )

                            DetailOverviewMetrics(location = location)

                            if (location.description.isNotBlank()) {
                                HorizontalDivider(
                                    color = Color.White.copy(alpha = 0.1f)
                                )

                                Text(
                                    text = location.description,
                                    color = Color.White,
                                    fontSize = 13.sp
                                )
                            }
                        }
                    }

                    // CCF-70: Radar HUD minh họa
                    item {
                        SafeLocationRadarPreview()
                    }

                    item {
                        DetailCard {
                            Text(
                                text = "THÔNG TIN TIẾP NHẬN",
                                color = AccentCyan,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )


                            if (location.capacity > 0) {
                                Text(
                                    text = "Sức chứa: ${location.capacity} người",
                                    color = Color.White
                                )

                                Text(
                                    text = "Đang trú: ${location.currentOccupancy} người",
                                    color = MutedText
                                )

                                LinearProgressIndicator(
                                    progress = {
                                        location.occupancyProgress
                                    },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(8.dp),
                                    color = statusColor,
                                    trackColor = Color.White.copy(alpha = 0.12f)
                                )

                                Text(
                                    text = "Còn ${location.availableSlots} chỗ",
                                    color = statusColor,
                                    fontWeight = FontWeight.Bold
                                )
                            } else {
                                Text(
                                    text = "Chưa có dữ liệu sức chứa.",
                                    color = MutedText
                                )
                            }
                        }
                    }

                    // CCF-70: Các khu vực tiếp nhận
                    item {
                        ReceptionAreasSection(location = location)
                    }

                    // CCF-70: Hậu cần và dịch vụ
                    item {
                        FacilityServicesSection(location = location)
                    }

                    // CCF-70: Thông số công trình
                    item {
                        BuildingInformationSection(location = location)
                    }

                    // CCF-70: Hướng dẫn an toàn
                    item {
                        SafetyGuidanceSection(location = location)
                    }

                    // CCF-70: Danh bạ liên hệ
                    item {
                        SafeLocationContactSection(
                            location = location,
                            onContactClick = onContactClick
                        )
                    }


                    if (location.facilities.isNotEmpty()) {
                        item {
                            Text(
                                text = "TIỆN ÍCH",
                                color = Color.White,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        items(location.facilities) { facility ->
                            FacilityDetailRow(facility)
                        }
                    }

                    if (location.safetyNote.isNotBlank()) {
                        item {
                            DetailCard {
                                Text(
                                    text = "LƯU Ý AN TOÀN",
                                    color = Color(0xFFFFB84D),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold
                                )

                                Text(
                                    text = location.safetyNote,
                                    color = Color.White,
                                    fontSize = 13.sp
                                )
                            }
                        }
                    }

                    item {
                        Button(
                            onClick = { onDirections(location) },
                            enabled = canNavigate,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = AccentCyan,
                                contentColor = PageBackground
                            )
                        ) {
                            Text(
                                text = "Chỉ đường đến điểm tránh trú",
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    if (!canNavigate) {
                        item {
                            Text(
                                text = "Chưa thể chỉ đường: địa điểm hoặc tuyến đường chưa được xác minh.",
                                color = MutedText,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailCard(
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = CardBackground
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content
        )
    }
}

@Composable
private fun FacilityDetailRow(
    facility: SafeLocationFacility
) {
    val label = when (facility) {
        SafeLocationFacility.CLEAN_WATER -> "Nước uống"
        SafeLocationFacility.ELECTRICITY -> "Điện"
        SafeLocationFacility.MEDICAL -> "Hỗ trợ y tế"
        SafeLocationFacility.HOT_MEALS -> "Thực phẩm"
        SafeLocationFacility.GENERATOR -> "Máy phát điện"
        SafeLocationFacility.RESCUE_PICKUP -> "Đón cứu hộ"
        SafeLocationFacility.EMERGENCY_CARE -> "Cấp cứu"
        SafeLocationFacility.OXYGEN -> "Oxy"
        SafeLocationFacility.DOCTOR -> "Bác sĩ"
        SafeLocationFacility.AMBULANCE -> "Xe cứu thương"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = CardBackground
        )
    ) {
        Text(
            text = "✓ $label",
            color = Color.White,
            modifier = Modifier.padding(14.dp),
            fontSize = 13.sp
        )
    }
}

@Composable
private fun DetailOverviewMetrics(
    location: SafeLocation
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        OverviewMetric(
            label = "KHOẢNG CÁCH",
            value = location.distanceMeters?.let { "$it m (mẫu)" }
                ?: "Chưa rõ",
            modifier = Modifier.weight(1f)
        )

        OverviewMetric(
            label = "THỜI GIAN",
            value = location.travelMinutes?.let { "$it phút (mẫu)" }
                ?: "Chưa rõ",
            modifier = Modifier.weight(1f)
        )

        OverviewMetric(
            label = "CAO TRÌNH",
            value = location.elevationMeters?.let { "$it m (mẫu)" }
                ?: "Chưa có",
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun OverviewMetric(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .background(
                Color(0xFF0C2031),
                RoundedCornerShape(10.dp)
            )
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = label,
            color = MutedText,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )

        Text(
            text = value,
            color = AccentCyan,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 2
        )
    }
}

@Composable
private fun SafeLocationRadarPreview() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = CardBackground
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "RADAR HUD / BẢN ĐỒ DẪN ĐƯỜNG",
                color = AccentCyan,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp
            )

            Text(
                text = "Mô phỏng giao diện — chưa có tuyến sơ tán được xác minh",
                color = MutedText,
                fontSize = 11.sp
            )

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(230.dp)
                    .background(
                        Color(0xFF0C2031),
                        RoundedCornerShape(14.dp)
                    )
                    .border(
                        width = 1.dp,
                        color = AccentCyan.copy(alpha = 0.25f),
                        shape = RoundedCornerShape(14.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Canvas(
                    modifier = Modifier.fillMaxSize()
                ) {
                    val center = Offset(
                        size.width / 2f,
                        size.height / 2f
                    )

                    val maxRadius = minOf(
                        size.width,
                        size.height
                    ) * 0.4f

                    for (index in 1..4) {
                        drawCircle(
                            color = Color(0xFF39D9E8).copy(
                                alpha = 0.12f
                            ),
                            radius = maxRadius * index / 4f,
                            center = center,
                            style = Stroke(width = 1.dp.toPx())
                        )
                    }

                    drawLine(
                        color = Color(0xFF39D9E8).copy(alpha = 0.2f),
                        start = Offset(center.x, 0f),
                        end = Offset(center.x, size.height),
                        strokeWidth = 1.dp.toPx()
                    )

                    drawLine(
                        color = Color(0xFF39D9E8).copy(alpha = 0.2f),
                        start = Offset(0f, center.y),
                        end = Offset(size.width, center.y),
                        strokeWidth = 1.dp.toPx()
                    )

                    drawCircle(
                        color = Color(0xFF39D9E8),
                        radius = 7.dp.toPx(),
                        center = center
                    )
                }

                Icon(
                    imageVector = Icons.Default.Navigation,
                    contentDescription = "Biểu tượng mô phỏng vị trí",
                    tint = Color.White,
                    modifier = Modifier.size(27.dp)
                )

                Text(
                    text = "MÔ PHỎNG — KHÔNG PHẢI GPS THỰC",
                    color = MutedText,
                    fontSize = 10.sp,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 12.dp)
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Tuyến đường: Chưa xác minh",
                    color = Color(0xFFFFB84D),
                    fontSize = 11.sp
                )

                Text(
                    text = "GPS: Chưa kết nối",
                    color = MutedText,
                    fontSize = 11.sp
                )
            }
        }
    }
}

@Composable
private fun ReceptionAreasSection(
    location: SafeLocation
) {
    DetailCard {
        Text(
            text = "KHU VỰC TIẾP NHẬN",
            color = AccentCyan,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = "Thông tin khu vực từ dữ liệu minh họa",
            color = MutedText,
            fontSize = 11.sp
        )

        if (location.receptionAreas.isEmpty()) {
            Text(
                text = "Chưa có thông tin phân chia khu vực tiếp nhận.",
                color = MutedText,
                fontSize = 12.sp
            )
        } else {
            location.receptionAreas.forEach { area ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Color(0xFF0C2031),
                            RoundedCornerShape(12.dp)
                        )
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = area.name,
                            modifier = Modifier.weight(1f),
                            color = Color.White,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp
                        )

                        Text(
                            text = "${area.currentOccupancy}/${area.capacity}",
                            color = AccentCyan,
                            fontSize = 12.sp
                        )
                    }

                    if (area.capacity > 0) {
                        LinearProgressIndicator(
                            progress = {
                                (area.currentOccupancy.toFloat() / area.capacity)
                                    .coerceIn(0f, 1f)
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(7.dp),
                            color = AccentCyan,
                            trackColor = Color.White.copy(alpha = 0.12f)
                        )
                    }

                    Text(
                        text = "Còn ${area.availableSlots} chỗ",
                        color = MutedText,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun FacilityServicesSection(
    location: SafeLocation
) {
    DetailCard {
        Text(
            text = "HẬU CẦN VÀ DỊCH VỤ",
            color = AccentCyan,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = "Thông tin tiện ích tại điểm tránh trú (dữ liệu minh họa)",
            color = MutedText,
            fontSize = 11.sp
        )

        if (location.facilityDetails.isEmpty()) {
            Text(
                text = "Chưa có thông tin chi tiết về hậu cần và dịch vụ.",
                color = MutedText,
                fontSize = 12.sp
            )
        } else {
            location.facilityDetails
                .chunked(2)
                .forEach { rowItems ->

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        rowItems.forEach { detail ->
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .background(
                                        Color(0xFF0C2031),
                                        RoundedCornerShape(12.dp)
                                    )
                                    .padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(7.dp)
                            ) {
                                Text(
                                    text = facilityDisplayName(detail.facility),
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )

                                Text(
                                    text = detail.statusLabel.ifBlank {
                                        "Chưa cập nhật"
                                    },
                                    color = AccentCyan,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium
                                )

                                if (detail.description.isNotBlank()) {
                                    Text(
                                        text = detail.description,
                                        color = MutedText,
                                        fontSize = 11.sp
                                    )
                                }
                            }
                        }

                        if (rowItems.size == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
        }
    }
}

private fun facilityDisplayName(
    facility: SafeLocationFacility
): String {
    return when (facility) {
        SafeLocationFacility.CLEAN_WATER -> "Nước uống"
        SafeLocationFacility.ELECTRICITY -> "Nguồn điện"
        SafeLocationFacility.MEDICAL -> "Hỗ trợ y tế"
        SafeLocationFacility.HOT_MEALS -> "Thực phẩm"
        SafeLocationFacility.GENERATOR -> "Máy phát điện"
        SafeLocationFacility.RESCUE_PICKUP -> "Đón cứu hộ"
        SafeLocationFacility.EMERGENCY_CARE -> "Cấp cứu"
        SafeLocationFacility.OXYGEN -> "Oxy"
        SafeLocationFacility.DOCTOR -> "Bác sĩ"
        SafeLocationFacility.AMBULANCE -> "Xe cứu thương"
    }
}

@Composable
private fun BuildingInformationSection(
    location: SafeLocation
) {
    DetailCard {
        Text(
            text = "THÔNG SỐ CÔNG TRÌNH",
            color = AccentCyan,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = "Thông tin công trình chưa được xác minh thực tế",
            color = MutedText,
            fontSize = 11.sp
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            BuildingMetric(
                title = "SỐ TẦNG",
                value = location.buildingFloors?.let {
                    "$it tầng"
                } ?: "Chưa có",
                modifier = Modifier.weight(1f)
            )

            BuildingMetric(
                title = "CAO TRÌNH",
                value = location.elevationMeters?.let {
                    "$it m (mẫu)"
                } ?: "Chưa có",
                modifier = Modifier.weight(1f)
            )
        }

        HorizontalDivider(
            color = Color.White.copy(alpha = 0.1f)
        )

        Text(
            text = "MÔ TẢ CÔNG TRÌNH",
            color = AccentCyan,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = location.buildingDescription.ifBlank {
                "Chưa có thông tin về kết cấu hoặc quy mô công trình."
            },
            color = MutedText,
            fontSize = 12.sp
        )

        Text(
            text = "LỐI TIẾP CẬN",
            color = AccentCyan,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = location.accessDescription.ifBlank {
                "Chưa có thông tin về lối tiếp cận an toàn."
            },
            color = MutedText,
            fontSize = 12.sp
        )
    }
}

@Composable
private fun BuildingMetric(
    title: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .background(
                Color(0xFF0C2031),
                RoundedCornerShape(12.dp)
            )
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = title,
            color = MutedText,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = value,
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun SafetyGuidanceSection(
    location: SafeLocation
) {
    DetailCard {
        Text(
            text = "HƯỚNG DẪN AN TOÀN",
            color = AccentCyan,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = "Thông tin tham khảo — chưa xác minh tuyến đường",
            color = MutedText,
            fontSize = 11.sp
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Color(0xFF0C2031),
                    RoundedCornerShape(12.dp)
                )
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "KHUYẾN NGHỊ DI CHUYỂN",
                color = AccentCyan,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )

            Text(
                text = location.evacuationAdvice.ifBlank {
                    "Chưa có hướng dẫn di chuyển đã xác minh. " +
                            "Hãy theo dõi thông báo chính thức của cơ quan chức năng."
                },
                color = Color.White,
                fontSize = 12.sp
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Color(0xFF493124),
                    RoundedCornerShape(12.dp)
                )
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "CẢNH BÁO NGẬP LỤT",
                color = Color(0xFFFFB84D),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )

            Text(
                text = location.floodWarningNote.ifBlank {
                    "Chưa có dữ liệu xác minh về tình trạng ngập " +
                            "trên tuyến đường đến địa điểm này."
                },
                color = Color.White,
                fontSize = 12.sp
            )
        }

        Text(
            text = "Không đi qua đường ngập, nước chảy xiết hoặc khu vực " +
                    "đã bị phong tỏa. Liên hệ lực lượng chức năng khi cần hỗ trợ.",
            color = MutedText,
            fontSize = 12.sp
        )

        if (!location.isVerified) {
            Text(
                text = "Địa điểm chưa được xác minh — không sử dụng thông tin này để tự quyết định sơ tán.",
                color = Color(0xFFFFB84D),
                fontWeight = FontWeight.SemiBold,
                fontSize = 11.sp
            )
        }
    }
}

@Composable
private fun SafeLocationContactSection(
    location: SafeLocation,
    onContactClick: (String) -> Unit
) {
    DetailCard {
        Text(
            text = "DANH BẠ LIÊN HỆ",
            color = AccentCyan,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = "Thông tin liên hệ tại điểm tránh trú",
            color = MutedText,
            fontSize = 11.sp
        )

        if (location.contacts.isEmpty()) {
            Text(
                text = "Chưa có thông tin liên hệ đã được xác minh.",
                color = MutedText,
                fontSize = 12.sp
            )
        } else {
            location.contacts.forEach { contact ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Color(0xFF0C2031),
                            RoundedCornerShape(12.dp)
                        )
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = null,
                        tint = AccentCyan,
                        modifier = Modifier.size(22.dp)
                    )

                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = contact.name,
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )

                        if (contact.role.isNotBlank()) {
                            Text(
                                text = contact.role,
                                color = MutedText,
                                fontSize = 11.sp
                            )
                        }

                        Text(
                            text = if (location.isVerified &&
                                contact.phoneNumber.isNotBlank()
                            ) {
                                contact.phoneNumber
                            } else {
                                "Số điện thoại chưa xác minh"
                            },
                            color = MutedText,
                            fontSize = 11.sp
                        )
                    }

                    IconButton(
                        onClick = {
                            onContactClick(contact.phoneNumber)
                        },
                        enabled = location.isVerified &&
                                contact.phoneNumber.isNotBlank()
                    ) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = "Liên hệ",
                            tint = AccentCyan
                        )
                    }
                }
            }
        }
    }
}