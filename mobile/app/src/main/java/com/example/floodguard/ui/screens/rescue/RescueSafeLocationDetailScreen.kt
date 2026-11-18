package com.example.floodguard.ui.screens.rescue

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.Toast
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

private val DetailBackground = Color(0xFF051424)
private val DetailSurface = Color(0xFF122131)
private val DetailText = Color(0xFFD4E4FA)
private val DetailMuted = Color(0xFFBBC9CD)
private val DetailCyan = Color(0xFF8AEBFF)
private val DetailGreen = Color(0xFF45F797)
private val DetailBorder = Color(0xFF2C3A4C)

private val DetailFont = FontFamily(
    Font(R.font.rescue_be_vietnam_regular, FontWeight.Normal),
    Font(R.font.rescue_be_vietnam_bold, FontWeight.Bold)
)

@Composable
internal fun RescueSafeLocationDetailScreen(
    id: String,
    ownerKey: String,
    viewModel: RescueSafeLocationViewModel,
    rescueLocation: RescueMapLocationController?,
    onBack: () -> Unit,
    onOverview: () -> Unit,
    onFloodMap: () -> Unit,
    onSos: () -> Unit
) {
    val sharedState by viewModel.detailState.collectAsStateWithLifecycle()
    // Never render detail from another navigation entry, even for the same ID.
    val state = if (
        sharedState.id == id && sharedState.ownerKey == ownerKey
    ) {
        sharedState
    } else {
        RescueSafeLocationDetailUiState(
            id = id,
            ownerKey = ownerKey,
            isLoading = true
        )
    }
    val context = LocalContext.current
    val controllerState = rescueLocation?.state

    val hasPermission =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

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

    BackHandler(
        enabled = sharedState.ownerKey == ownerKey,
        onBack = onBack
    )

    // Runs once for this NavBackStackEntry, including a second visit to A.
    LaunchedEffect(id, ownerKey) {
        viewModel.openDetail(id, ownerKey)
        viewModel.onDetailGpsChanged(ownerKey, gps, fromLastKnown)
    }

    // GPS changes from an exiting entry are ignored by the ViewModel.
    LaunchedEffect(id, ownerKey, gps, fromLastKnown) {
        viewModel.onDetailGpsChanged(ownerKey, gps, fromLastKnown)
    }

    DisposableEffect(viewModel, id, ownerKey) {
        onDispose {
            viewModel.closeDetail(id, ownerKey)
        }
    }

    val location = state.location?.takeIf { it.id == id }

    val canNavigate =
        location != null &&
            state.canOpenDirections &&
            !state.isLoading

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = DetailCyan,
            onPrimary = DetailBackground,
            background = DetailBackground,
            onBackground = DetailText,
            surface = DetailSurface,
            onSurface = DetailText
        )
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = DetailBackground
        ) {
            Scaffold(
                modifier = Modifier.safeDrawingPadding(),
                containerColor = DetailBackground,
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
                            Text("Quay lại")
                        }

                        Text(
                            text = "Chi tiết điểm tránh trú",
                            color = DetailText,
                            fontFamily = DetailFont,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                    }
                },
                bottomBar = {
                    RescueBottomBar(
                        selectedTab = RescueMainTab.SAFE_LOCATIONS,
                        onOverview = onOverview,
                        onMap = onFloodMap,
                        onSos = onSos,
                        onSafeLocations = onBack
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
                        item {
                            LinearProgressIndicator(
                                modifier = Modifier.fillMaxWidth(),
                                color = DetailCyan
                            )
                        }
                    }

                    state.errorMessage?.let { message ->
                        item {
                            Surface(
                                color = DetailSurface,
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(
                                    1.dp,
                                    DetailBorder
                                )
                            ) {
                                Column(
                                    modifier = Modifier.padding(16.dp),
                                    verticalArrangement =
                                        Arrangement.spacedBy(10.dp)
                                ) {
                                    Text(
                                        text = if (state.isStale) {
                                            "Chưa thể cập nhật: $message"
                                        } else {
                                            message
                                        },
                                        color = DetailText,
                                        fontFamily = DetailFont
                                    )

                                    if (!state.noLongerAvailable) {
                                        OutlinedButton(
                                            onClick = {
                                                viewModel.refreshDetail(ownerKey)
                                            }
                                        ) {
                                            Text("Thử lại")
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (
                        location == null &&
                        !state.isLoading &&
                        state.errorMessage == null
                    ) {
                        item {
                            Text(
                                text = "Chưa có thông tin chi tiết.",
                                color = DetailMuted,
                                fontFamily = DetailFont
                            )
                        }
                    }

                    if (location != null) {
                        item {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                colors = CardDefaults.cardColors(
                                    containerColor = DetailSurface
                                ),
                                shape = RoundedCornerShape(14.dp),
                                border = BorderStroke(
                                    1.dp,
                                    DetailBorder
                                )
                            ) {
                                Column(
                                    modifier = Modifier.padding(18.dp),
                                    verticalArrangement =
                                        Arrangement.spacedBy(12.dp)
                                ) {
                                    Text(
                                        text = location.name,
                                        color = DetailText,
                                        fontFamily = DetailFont,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 21.sp
                                    )

                                    Text(
                                        text = catalogTypeLabel(location.type),
                                        color = DetailGreen,
                                        fontFamily = DetailFont,
                                        fontSize = 13.sp
                                    )

                                    HorizontalDivider(
                                        color = DetailBorder
                                    )

                                    DetailField(
                                        title = "Địa chỉ",
                                        value = location.address
                                    )

                                    location.description?.let {
                                        DetailField(
                                            title = "Mô tả",
                                            value = it
                                        )
                                    }

                                    DetailField(
                                        title = "Tọa độ",
                                        value = "${location.latitude}, " +
                                            "${location.longitude}"
                                    )

                                    if (
                                        gps != null &&
                                        !state.isLoading &&
                                        !state.isStale &&
                                        location.distanceKm != null
                                    ) {
                                        DetailField(
                                            title = "Khoảng cách tham khảo",
                                            value = "Cách bạn khoảng " +
                                                String.format(
                                                    Locale.forLanguageTag("vi-VN"),
                                                    "%.2f",
                                                    location.distanceKm
                                                ) + " km (đường chim bay)"
                                        )
                                    }
                                }
                            }
                        }

                        item {
                            Button(
                                onClick = {
                                    openSafeLocationDirections(
                                        context,
                                        location
                                    )
                                },
                                enabled = canNavigate,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text(
                                    text = "Mở Google Maps chỉ đường",
                                    fontFamily = DetailFont
                                )
                            }
                        }

                        if (state.isStale) {
                            item {
                                Text(
                                    text = "Thông tin cũ chưa được xác minh " +
                                        "lại. Chỉ đường tạm thời bị vô hiệu.",
                                    color = DetailMuted,
                                    fontFamily = DetailFont,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }

                    item {
                        Text(
                            text = when {
                                gps == null ->
                                    "Chưa có GPS hợp lệ. Có thể xem địa điểm " +
                                        "và mở ứng dụng chỉ đường."
                                fromLastKnown ->
                                    "Đang sử dụng vị trí hợp lệ gần nhất."
                                else ->
                                    "Đang sử dụng vị trí của bạn."
                            },
                            color = DetailMuted,
                            fontFamily = DetailFont,
                            fontSize = 12.sp
                        )
                    }

                    item {
                        OutlinedButton(
                            onClick = {
                                rescueLocation?.locate?.invoke()
                            },
                            enabled = rescueLocation != null,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                controllerState?.actionLabel
                                    ?: "Cập nhật vị trí"
                            )
                        }
                    }

                    item {
                        Text(
                            text = "Khoảng cách chỉ tính theo đường thẳng, " +
                                "không phải quãng đường di chuyển. " +
                                "Hãy xác minh điều kiện an toàn thực tế " +
                                "trước khi đến điểm tránh trú.",
                            color = DetailMuted,
                            fontFamily = DetailFont,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailField(
    title: String,
    value: String
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = title,
            color = DetailMuted,
            fontFamily = DetailFont,
            fontSize = 12.sp
        )

        Text(
            text = value,
            color = DetailText,
            fontFamily = DetailFont,
            fontSize = 14.sp
        )
    }
}

private fun openSafeLocationDirections(
    context: Context,
    location: RescueCatalogLocation
) {
    val destination =
        "${location.latitude},${location.longitude}"

    val mapsUri = Uri.parse(
        "google.navigation:q=$destination"
    )

    try {
        val googleMapsIntent = Intent(
            Intent.ACTION_VIEW,
            mapsUri
        ).apply {
            setPackage("com.google.android.apps.maps")
        }

        context.startActivity(googleMapsIntent)
        return
    } catch (_: Exception) {
        // Google Maps is unavailable; fall back to a browser.
    }

    try {
        val webUri = Uri.Builder()
            .scheme("https")
            .authority("www.google.com")
            .appendPath("maps")
            .appendPath("dir")
            .appendQueryParameter("api", "1")
            .appendQueryParameter("destination", destination)
            .build()

        context.startActivity(
            Intent(Intent.ACTION_VIEW, webUri)
        )
    } catch (_: Exception) {
        Toast.makeText(
            context,
            "Không thể mở ứng dụng chỉ đường.",
            Toast.LENGTH_LONG
        ).show()
    }
}
