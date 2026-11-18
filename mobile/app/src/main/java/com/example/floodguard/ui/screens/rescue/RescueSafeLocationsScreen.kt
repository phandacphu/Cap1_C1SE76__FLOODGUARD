package com.example.floodguard.ui.screens.rescue

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.floodguard.R
import com.example.floodguard.data.repository.RescueCatalogGps
import com.example.floodguard.data.repository.RescueCatalogLocation
import java.util.Locale

private val CatalogBackground = Color(0xFF051424)
private val CatalogSurface = Color(0xFF122131)
private val CatalogText = Color(0xFFD4E4FA)
private val CatalogMuted = Color(0xFFBBC9CD)
private val CatalogCyan = Color(0xFF8AEBFF)
private val CatalogGreen = Color(0xFF45F797)
private val CatalogBorder = Color(0xFF2C3A4C)

private val CatalogFont = FontFamily(
    Font(R.font.rescue_be_vietnam_regular, FontWeight.Normal),
    Font(R.font.rescue_be_vietnam_bold, FontWeight.Bold)
)

@Composable
internal fun RescueSafeLocationsScreen(
    viewModel: RescueSafeLocationViewModel,
    rescueLocation: RescueMapLocationController?,
    onOverview: () -> Unit,
    onFloodMap: () -> Unit,
    onSos: () -> Unit,
    onOpenDetail: (String) -> Unit
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var search by rememberSaveableCatalogSearch()

    LaunchedEffect(viewModel) {
        viewModel.onListScreenEntered()
    }

    val hasPermission =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

    val controllerState = rescueLocation?.state

    val fix = if (hasPermission) {
        controllerState?.fix ?: controllerState?.lastKnownFix
    } else {
        null
    }

    val gps = fix?.let {
        RescueCatalogGps(it.latitude, it.longitude)
    }?.takeIf { it.isValid() }

    val fromLastKnown =
        gps != null && controllerState?.fix == null

    LaunchedEffect(gps, fromLastKnown) {
        viewModel.onGpsChanged(gps, fromLastKnown)
    }

    var showMap by androidx.compose.runtime.saveable.rememberSaveable {
        mutableStateOf(false)
    }

    val filtered = remember(state.locations, search) {
        val keyword = search.trim()

        if (keyword.isEmpty()) {
            state.locations
        } else {
            state.locations.filter {
                it.name.contains(keyword, ignoreCase = true) ||
                    it.address.contains(keyword, ignoreCase = true)
            }
        }
    }

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = CatalogCyan,
            onPrimary = CatalogBackground,
            background = CatalogBackground,
            onBackground = CatalogText,
            surface = CatalogSurface,
            onSurface = CatalogText
        )
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = CatalogBackground
        ) {
            Scaffold(
                modifier = Modifier.safeDrawingPadding(),
                containerColor = CatalogBackground,
                contentWindowInsets = WindowInsets(0, 0, 0, 0),
                topBar = {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.LocationOn,
                            contentDescription = null,
                            tint = CatalogGreen,
                            modifier = Modifier.size(25.dp)
                        )

                        Text(
                            text = "Điểm tránh trú",
                            color = CatalogText,
                            fontFamily = CatalogFont,
                            fontSize = 21.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                },
                bottomBar = {
                    RescueBottomBar(
                        selectedTab = RescueMainTab.SAFE_LOCATIONS,
                        onOverview = onOverview,
                        onMap = onFloodMap,
                        onSos = onSos,
                        onSafeLocations = {}
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
                    item {
                        Text(
                            text = "Các địa điểm do hệ thống cung cấp",
                            color = CatalogMuted,
                            fontFamily = CatalogFont,
                            fontSize = 13.sp
                        )
                    }

                    item {
                        OutlinedTextField(
                            value = search,
                            onValueChange = { search = it },
                            label = { Text("Tìm theo tên hoặc địa chỉ") },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Outlined.Search,
                                    contentDescription = null
                                )
                            },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )
                    }

                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedButton(
                                onClick = viewModel::refreshLocations,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Làm mới")
                            }

                            OutlinedButton(
                                onClick = {
                                    rescueLocation?.locate?.invoke()
                                },
                                enabled = rescueLocation != null,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = controllerState?.actionLabel
                                        ?: "Vị trí của tôi",
                                    maxLines = 1
                                )
                            }
                        }
                    }

                    item {
                        Text(
                            text = when {
                                gps == null ->
                                    "Chưa có GPS. Danh sách vẫn xem được."
                                fromLastKnown ->
                                    "Theo vị trí lần cuối"
                                else ->
                                    "Đang sử dụng vị trí của bạn"
                            },
                            color = CatalogMuted,
                            fontFamily = CatalogFont,
                            fontSize = 12.sp
                        )
                    }

                    item(key = "view_mode") {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            FilterChip(
                                selected = !showMap,
                                onClick = { showMap = false },
                                label = { Text("Danh sách") },
                                modifier = Modifier.weight(1f)
                            )

                            FilterChip(
                                selected = showMap,
                                onClick = { showMap = true },
                                label = { Text("Bản đồ") },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    if (state.isLoading) {
                        item {
                            LinearProgressIndicator(
                                modifier = Modifier.fillMaxWidth(),
                                color = CatalogCyan
                            )
                        }
                    }

                    state.errorMessage?.let { message ->
                        item {
                            CatalogNotice(
                                if (state.hasLoaded) {
                                    "Chưa thể cập nhật: $message"
                                } else {
                                    message
                                }
                            )
                        }
                    }

                    if (
                        state.isStale &&
                        state.hasLoaded &&
                        state.errorMessage == null
                    ) {
                        item(key = "stale_catalog_notice") {
                            CatalogNotice(
                                "Đang cập nhật danh sách. " +
                                    "Dữ liệu hiển thị là lần tải trước."
                            )
                        }
                    }

                    if (state.hasLoaded) {
                        item {
                            Text(
                                text = "Tổng cộng ${state.locations.size} địa điểm",
                                color = CatalogCyan,
                                fontFamily = CatalogFont,
                                fontSize = 13.sp
                            )
                        }
                    }

                    if (state.hasLoaded && filtered.isEmpty()) {
                        item {
                            CatalogNotice(
                                if (search.isNotBlank() &&
                                    state.locations.isNotEmpty()
                                ) {
                                    "Không tìm thấy địa điểm phù hợp."
                                } else {
                                    "Hiện chưa có điểm tránh trú được cung cấp."
                                }
                            )
                        }
                    }

                    if (showMap) {
                        item(key = "safe_location_map") {
                            RescueSafeLocationsMap(
                                locations = filtered,
                                allLocations = state.locations,
                                userGps = gps,
                                gpsCenterRequestId = controllerState?.centerRequestId ?: 0L,
                                onOpenDetail = onOpenDetail,
                                onShowAll = { search = "" },
                                onRequestLocation = {
                                    rescueLocation?.locate?.invoke()
                                },
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    } else {
                        items(
                            items = filtered,
                            key = { it.id }
                        ) { location ->
                            CatalogLocationCard(
                                location = location,
                                showDistance = gps != null &&
                                    state.gps == gps,
                                onClick = {
                                    onOpenDetail(location.id)
                                }
                            )
                        }
                    }

                    item {
                        Text(
                            text = "Địa điểm và chỉ đường mang tính tham khảo. " +
                                "Hãy xác minh điều kiện an toàn thực tế trước khi di chuyển.",
                            color = CatalogMuted,
                            fontFamily = CatalogFont,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun rememberSaveableCatalogSearch(): MutableState<String> =
    androidx.compose.runtime.saveable.rememberSaveable {
        mutableStateOf("")
    }

@Composable
private fun CatalogNotice(message: String) {
    Surface(
        color = CatalogSurface,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, CatalogBorder)
    ) {
        Text(
            text = message,
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            color = CatalogMuted,
            fontFamily = CatalogFont,
            fontSize = 13.sp
        )
    }
}

@Composable
private fun CatalogLocationCard(
    location: RescueCatalogLocation,
    showDistance: Boolean,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = CatalogSurface
        ),
        border = BorderStroke(1.dp, CatalogBorder),
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = location.name,
                color = CatalogText,
                fontFamily = CatalogFont,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
            )

            Text(
                text = location.address,
                color = CatalogMuted,
                fontFamily = CatalogFont,
                fontSize = 13.sp
            )

            Text(
                text = catalogTypeLabel(location.type),
                color = CatalogGreen,
                fontFamily = CatalogFont,
                fontSize = 12.sp
            )

            if (showDistance && location.distanceKm != null) {
                Text(
                    text = "Cách bạn khoảng " +
                        String.format(
                            Locale.forLanguageTag("vi-VN"),
                            "%.2f",
                            location.distanceKm
                        ) + " km",
                    color = CatalogCyan,
                    fontFamily = CatalogFont,
                    fontSize = 13.sp
                )
            }

            Text(
                text = "Nhấn để xem chi tiết",
                color = CatalogMuted,
                fontFamily = CatalogFont,
                fontSize = 12.sp
            )
        }
    }
}

internal fun catalogTypeLabel(type: String): String = when (type) {
    "shelter" -> "Điểm tránh trú"
    "school" -> "Trường học"
    "hospital" -> "Bệnh viện"
    "community_center" -> "Nhà sinh hoạt cộng đồng"
    else -> "Khác"
}
