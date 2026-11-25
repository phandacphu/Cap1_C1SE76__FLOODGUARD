package com.example.floodguard.ui.screens.rescue

import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.IntSize
import com.example.floodguard.R
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.floodguard.core.network.ApiClient

import com.example.floodguard.data.repository.FloodAreaRepository
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.Polygon
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberUpdatedMarkerState
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import kotlin.math.ceil

private val MapBackground = Color(0xFF051424)
private val MapSurface = Color(0xFF122131)
private val MapText = Color(0xFFD4E4FA)
private val MapMuted = Color(0xFFBBC9CD)
private val MapCyan = Color(0xFF8AEBFF)
private val MapFont = FontFamily(
    Font(R.font.rescue_be_vietnam_regular, FontWeight.Normal),
    Font(R.font.rescue_be_vietnam_bold, FontWeight.Bold)
)

@Composable
internal fun RescueMapScreen(
    onBack: () -> Unit,
    location: RescueMapLocationController,
    warningViewModel: RescueFloodWarningV2ViewModel,
    accountKey: String,
    onSosTab: (() -> Unit)? = null,
    onSafeLocationsTab: (() -> Unit)? = null,
    onOverviewTab: (() -> Unit)? = null,
    title: String = "Bản đồ cứu hộ",
    initiallyShowFloodLayers: Boolean = true,
    embedded: Boolean = false,
    modifier: Modifier = Modifier
) {
    BackHandler(enabled = !embedded, onBack = onBack)
    val context = LocalContext.current
    val dataViewModel: RescueMapDataViewModel = viewModel(
        key = "rescue-map-areas:$accountKey"
    ) {
        val areas = FloodAreaRepository(ApiClient.floodAreaApi)
        RescueMapDataViewModel(
            // Legacy flood areas are fallback reference geometry only when V2 fails.
            loadFloodAreas = { areas.getFloodAreas() },
            // The shared, account-scoped V2 ViewModel owns protected warning data.
            loadActiveWarnings = { Result.success(emptyList()) }
        )
    }
    val legacyState by dataViewModel.uiState.collectAsStateWithLifecycle()
    val activeMapState by warningViewModel.activeMapState.collectAsStateWithLifecycle()
    val accessFailure by warningViewModel.accessFailure.collectAsStateWithLifecycle()

    val dataState = legacyState.copy(
        activeWarnings = when {
            accessFailure != null -> RescueMapLoadState.Error(
                "Không thể truy cập cảnh báo. Hãy đăng nhập lại."
            )
            activeMapState.isLoading && !activeMapState.hasLoaded ->
                RescueMapLoadState.Loading
            activeMapState.errorMessage != null && !activeMapState.hasLoaded ->
                RescueMapLoadState.Error(activeMapState.errorMessage ?: "Lỗi cảnh báo.")
            !activeMapState.hasLoaded -> RescueMapLoadState.Loading
            activeMapState.warnings.isEmpty() -> RescueMapLoadState.Empty
            else -> RescueMapLoadState.Data(activeMapState.warnings)
        }
    )

    // Both navigation entries load the same V2 source on the existing Rescue map.
    LaunchedEffect(warningViewModel) {
        warningViewModel.onMapEntered(includeZones = false)
    }
    val historyViewModel: RescueHistoryViewModel = viewModel()
    val historyLayers by historyViewModel.layers.collectAsStateWithLifecycle()
    // Coordinates are prepared once by the ViewModel, not during UI recomposition.
    val historyPoints = historyLayers["points"]?.points.orEmpty()
    val layers = remember(dataState.floodAreas) {
        val items = when (val state = dataState.floodAreas) {
            is RescueMapLoadState.Data -> state.items
            else -> emptyList()
        }
        buildRescueFloodMapLayers(items)
    }
    val polygonPoints = remember(layers) {
        layers.areas.associate { area ->
            area.id to area.vertices.map { LatLng(it.latitude, it.longitude) }
        }
    }
    // One Rescue flood map for both the tab and the warning detail.
    // Warning V2 does not replace its historical and flood layers.
    val refreshMapData: () -> Unit = {
        if (accessFailure == null) {
            warningViewModel.refreshActiveMapWarnings()
            dataViewModel.retryFloodAreas()
            historyViewModel.refresh()
        }
    }
    var showAreas by rememberSaveable { mutableStateOf(false) }
    var selectedAreaId by rememberSaveable { mutableStateOf<String?>(null) }
    var focusAreaId by remember { mutableStateOf<String?>(null) }
    var selectedHistoryPoint by remember { mutableStateOf<RescueHistoryMapPoint?>(null) }
    var focusHistoryPoint by remember { mutableStateOf<LatLng?>(null) }
    var selectedHistoryPolygon by remember { mutableStateOf<RescueHistoryMapPolygon?>(null) }
    var focusHistoryPolygon by remember { mutableStateOf<List<LatLng>?>(null) }
    var focusMessage by remember { mutableStateOf<String?>(null) }
    var showFloodLayers by rememberSaveable(initiallyShowFloodLayers) { mutableStateOf(initiallyShowFloodLayers) }
    var mapSize by remember { mutableStateOf(IntSize.Zero) }
    var attempt by remember { mutableStateOf(0) }
    var mapLoaded by remember { mutableStateOf(false) }
    var timedOut by remember { mutableStateOf(false) }
    var handledCenterRequest by rememberSaveable { mutableLongStateOf(0L) }

    // Maps Compose saves this state through configuration/process recreation.
    // Do not put it inside the information-card or retry branches.
    val camera = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(LatLng(16.0544, 108.2022), 12f)
    }

    val hasMapConfiguration = remember(context, attempt) {
        runCatching {
            val info = context.packageManager.getApplicationInfo(
                context.packageName,
                PackageManager.GET_META_DATA
            )
            val configuredKey = info.metaData
                ?.getString("com.google.android.geo.API_KEY")?.trim().orEmpty()
            configuredKey.isNotEmpty() &&
                !configuredKey.contains("\${") &&
                !configuredKey.contains("YOUR_API_KEY", ignoreCase = true) &&
                !configuredKey.contains("DEFAULT_API_KEY", ignoreCase = true)
        }.getOrDefault(false)
    }

    LaunchedEffect(attempt, mapLoaded, hasMapConfiguration) {
        timedOut = false
        if (hasMapConfiguration && !mapLoaded) {
            delay(20_000)
            timedOut = true
        }
    }

    val retry: () -> Unit = {
        mapLoaded = false
        timedOut = false
        attempt += 1
    }

    LaunchedEffect(focusAreaId, mapLoaded, mapSize) {
        val id = focusAreaId ?: return@LaunchedEffect
        if (!mapLoaded || mapSize.width <= 0 || mapSize.height <= 0) return@LaunchedEffect
        val points = polygonPoints[id] ?: run {
            focusAreaId = null
            return@LaunchedEffect
        }
        try {
            val bounds = LatLngBounds.builder().apply { points.forEach { include(it) } }.build()
            val padding = minOf(48, minOf(mapSize.width, mapSize.height) / 6)
            camera.animate(CameraUpdateFactory.newLatLngBounds(bounds, mapSize.width, mapSize.height, padding))
            focusMessage = null
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            focusMessage = "Chưa di chuyển được đến vùng. Hãy chọn lại trong danh sách."
        } finally {
            focusAreaId = null
        }
    }

    LaunchedEffect(focusHistoryPoint, mapLoaded) {
        val point = focusHistoryPoint ?: return@LaunchedEffect
        if (!mapLoaded) return@LaunchedEffect
        try {
            camera.animate(CameraUpdateFactory.newLatLngZoom(point, 16f))
            focusMessage = null
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            focusMessage = "Chưa di chuyển được đến điểm. Vui lòng thử lại."
        } finally {
            focusHistoryPoint = null
        }
    }

    LaunchedEffect(focusHistoryPolygon, mapLoaded, mapSize) {
        val ring = focusHistoryPolygon ?: return@LaunchedEffect
        if (!mapLoaded || mapSize.width <= 0 || mapSize.height <= 0) return@LaunchedEffect
        try {
            val bounds = LatLngBounds.builder().apply { ring.forEach { include(it) } }.build()
            val padding = minOf(48, minOf(mapSize.width, mapSize.height) / 6)
            camera.animate(CameraUpdateFactory.newLatLngBounds(bounds, mapSize.width, mapSize.height, padding))
            focusMessage = null
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            focusMessage = "Chưa di chuyển được đến đa giác lịch sử. Vui lòng thử lại."
        } finally {
            focusHistoryPolygon = null
        }
    }

    LaunchedEffect(mapLoaded, location.state.centerRequestId) {
        val fix = location.state.fix
        if (mapLoaded && fix != null &&
            location.state.centerRequestId != handledCenterRequest
        ) {
            // Center once for each acquired fix, including the automatic login request.
            handledCenterRequest = location.state.centerRequestId
            camera.animate(CameraUpdateFactory.newLatLngZoom(
                LatLng(fix.latitude, fix.longitude),
                if (fix.isApproximate) 13f else 16f
            ))
        }
    }

    Surface(
        modifier = if (embedded) modifier else modifier.fillMaxSize(),
        color = MapBackground
    ) {
        Column(
            modifier = if (embedded) Modifier.fillMaxSize()
                else Modifier.fillMaxSize().safeDrawingPadding()
        ) {
            if (!embedded) {
                Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    title,
                    modifier = Modifier.weight(1f),
                    fontFamily = MapFont,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = MapText
                )
            }
            }

            val areaLoadFailed = dataState.floodAreas is RescueMapLoadState.Error
            val historyLoadFailed = historyLayers.values.any { it.error }
            if (showFloodLayers && (historyLoadFailed || layers.skippedCount > 0 || areaLoadFailed)) {
                Surface(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                    color = MapSurface,
                    shape = MaterialTheme.shapes.small
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            if (layers.skippedCount > 0) {
                                MapLabel("${layers.skippedCount} vùng có thông tin hoặc ranh giới không hợp lệ.")
                            }
                            if (areaLoadFailed) MapLabel("Chưa tải được đa giác tham khảo cũ.")
                            if (historyLoadFailed) {
                                MapLabel("Một phần dữ liệu lịch sử chưa tải được.")
                                if (historyLayers.values.any { it.error &&
                                        (it.points.isNotEmpty() || it.polygons.isNotEmpty()) }) {
                                    MapLabel("Đang giữ dữ liệu lịch sử lần tải trước.")
                                }
                            }
                        }
                        TextButton(onClick = refreshMapData, enabled = accessFailure == null) {
                            MapLabel("Tải lại", MapCyan)
                        }
                    }
                }
            }

            if (!embedded) {
                Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val freshFix = location.state.fix
                val fix = freshFix ?: location.state.lastKnownFix
                Column(modifier = Modifier.weight(1f)) {
                    if (fix == null) {
                        MapLabel(location.state.message)
                    } else {
                        if (freshFix == null) {
                            MapLabel("Mất kết nối GPS · vị trí lần cuối (chưa cập nhật)", MapCyan)
                        } else {
                            MapLabel(if (fix.isApproximate) "Vị trí gần đúng" else "Vị trí lần lấy gần nhất", MapCyan)
                        }
                        MapLabel(fix.accuracyMeters?.let {
                            "Độ chính xác lần lấy cuối khoảng ${ceil(it.toDouble()).toLong()} m"
                        } ?: "Thiết bị chưa cung cấp độ chính xác")
                        if (fix.isApproximate) {
                            TextButton(onClick = location.openAppSettings) {
                                MapLabel("Đổi quyền vị trí", MapCyan)
                            }
                        }
                    }
                }
                Button(
                    onClick = location.locate,
                    enabled = !location.state.isLoading && hasMapConfiguration,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MapCyan,
                        contentColor = MapBackground
                    )
                ) {
                    Text(location.state.actionLabel, fontFamily = MapFont)
                }
            }
            }

            Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
                if (!hasMapConfiguration) {
                    Column(
                        modifier = Modifier.align(Alignment.Center).padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        MapLabel("Chưa có cấu hình bản đồ", MapText)
                        MapLabel("Vui lòng kiểm tra cấu hình Google Maps của ứng dụng rồi mở lại màn hình.")
                        Button(
                            onClick = retry,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MapCyan,
                                contentColor = MapBackground
                            )
                        ) { Text("Kiểm tra lại") }
                    }
                } else {
                    key(attempt) {
                        GoogleMap(
                            modifier = Modifier.fillMaxSize().onSizeChanged { mapSize = it },
                            cameraPositionState = camera,
                            properties = MapProperties(isMyLocationEnabled = false),
                            uiSettings = MapUiSettings(
                                zoomControlsEnabled = true,
                                zoomGesturesEnabled = true,
                                scrollGesturesEnabled = true,
                                myLocationButtonEnabled = false,
                                mapToolbarEnabled = false
                            ),
                            onMapLoaded = { mapLoaded = true }
                        ) {
                            // Keep map nodes alive when hiding the flood layers.
                            // Changing visible updates the existing SDK objects.
                            val historyMarkerIcon = remember {
                                BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_RED)
                            }
                            // Historical polygons drawn by Web Admin.
                                // Reference only, never a current flood alert.
                                historyLayers["areas"]?.polygons.orEmpty()
                                    .forEachIndexed { index, polygon ->
                                        key("historical-admin-area", polygon.id ?: index, index) {
                                            Polygon(
                                                points = polygon.outer,
                                                holes = polygon.holes,
                                                visible = showFloodLayers,
                                                clickable = showFloodLayers,
                                                fillColor = Color(0xFFC62828).copy(alpha = 0.22f),
                                                strokeColor = Color(0xFFC62828),
                                                strokeWidth = 4f,
                                                zIndex = 4f,
                                                onClick = {
                                                    showAreas = false
                                                    selectedAreaId = null
                                                    selectedHistoryPoint = null
                                                    selectedHistoryPolygon = polygon
                                                }
                                            )
                                        }
                                    }
                                listOf("radar", "buffers").forEach { name ->
                                    historyLayers[name]?.polygons.orEmpty().forEachIndexed { index, polygon ->
                                        key("history-polygon", name, index) {
                                            Polygon(
                                                points = polygon.outer,
                                                holes = polygon.holes,
                                                visible = showFloodLayers,
                                                fillColor = Color(0xFFE53935).copy(alpha = if (name == "radar") 0.32f else 0.16f),
                                                strokeColor = Color(0xFFE53935).copy(alpha = 0.7f),
                                                strokeWidth = if (name == "radar") 1f else 2f,
                                                zIndex = if (name == "radar") 2f else 3f
                                            )
                                        }
                                    }
                                }
                            // The old Rescue reference markers and their detail sheets stay
                            // available on both entry paths, independently of V2 polygons.
                            historyPoints.forEachIndexed { index, point ->
                                key("history-point", point.id ?: index) {
                                    Marker(
                                        state = rememberUpdatedMarkerState(position = point.position),
                                        visible = showFloodLayers,
                                        title = point.name ?: "Vùng ngập lịch sử",
                                        snippet = "Dữ liệu tham khảo lịch sử, không phải cảnh báo hiện tại",
                                        icon = historyMarkerIcon,
                                        onClick = {
                                            showAreas = false
                                            selectedAreaId = null
                                            selectedHistoryPolygon = null
                                            selectedHistoryPoint = point
                                            true
                                        }
                                    )
                                }
                            }
                            layers.areas.forEach { area ->
                                    key("system-area", area.id) {
                                        val color = rescueAreaColor(area)
                                        Polygon(
                                            points = polygonPoints.getValue(area.id),
                                            visible = showFloodLayers,
                                            clickable = true,
                                            fillColor = color.copy(alpha = area.areaType.fillAlpha),
                                            strokeColor = if (area.areaType == RescueAreaType.LOW_LYING)
                                                color.copy(alpha = 0.7f) else color,
                                            strokeWidth = if (selectedAreaId == area.id) 7f else 3f,
                                            zIndex = if (area.areaType == RescueAreaType.FLOOD) 10f else 5f,
                                            onClick = {
                                                selectedHistoryPoint = null
                                                selectedHistoryPolygon = null
                                                selectedAreaId = area.id
                                                showAreas = true
                                            }
                                        )
                                    }
                                }
                            val freshFix = location.state.fix
                            (freshFix ?: location.state.lastKnownFix)?.let { fix ->
                                val point = LatLng(fix.latitude, fix.longitude)
                                fix.accuracyMeters?.takeIf { it > 0f && freshFix != null }?.let { accuracy ->
                                    Circle(
                                        center = point,
                                        radius = accuracy.toDouble(),
                                        fillColor = MapCyan.copy(alpha = 0.15f),
                                        strokeColor = MapCyan,
                                        strokeWidth = 2f,
                                        zIndex = 30f
                                    )
                                }
                                Marker(
                                    state = rememberUpdatedMarkerState(position = point),
                                    title = if (freshFix == null) "GPS cuối (chưa cập nhật)" else "Vị trí cứu hộ (lần lấy gần nhất)",
                                    snippet = if (freshFix == null) "Mất kết nối GPS · Không dùng như vị trí hiện tại"
                                        else if (fix.isApproximate) "Vị trí gần đúng" else "Vị trí từ thiết bị",
                                    icon = BitmapDescriptorFactory.defaultMarker(
                                        if (freshFix == null) BitmapDescriptorFactory.HUE_YELLOW
                                        else BitmapDescriptorFactory.HUE_CYAN
                                    )
                                )
                            }
                        }
                    }

                    if (mapLoaded) {
                        Column(modifier = Modifier.align(Alignment.TopStart).padding(12.dp)) {
                            Button(
                                onClick = {
                                    showFloodLayers = !showFloodLayers
                                    if (!showFloodLayers) {
                                        showAreas = false
                                        selectedAreaId = null
                                        selectedHistoryPoint = null
                                        selectedHistoryPolygon = null
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (showFloodLayers) MapSurface else Color(0xFF263B49),
                                    contentColor = MapCyan
                                )
                            ) { Text("Vùng ngập", fontFamily = MapFont) }
                            if (showFloodLayers) {
                                Surface(color = MapSurface, shape = MaterialTheme.shapes.small) {
                                    Column(modifier = Modifier.padding(8.dp)) {

                                        // Exactly the old Rescue map legend and polygon layers.
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Box(
                                                modifier = Modifier.size(14.dp)
                                                    .background(Color(RescueAreaType.FLOOD.colorArgb))
                                            )
                                            MapLabel("  Vùng ngập", MapText)
                                        }
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(
                                                imageVector = Icons.Filled.Place,
                                                contentDescription = null,
                                                tint = Color(0xFFF44336),
                                                modifier = Modifier.size(18.dp)
                                            )
                                            MapLabel(" Vùng ngập lịch sử", Color(0xFFFF7777))
                                        }
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Box(
                                                modifier = Modifier.size(14.dp)
                                                    .background(Color(0xFFE53935).copy(alpha = 0.40f))
                                            )
                                            MapLabel("  Vùng trũng", MapText)
                                        }


                                    }
                                }
                            }
                        }
                        focusMessage?.let { message ->
                            Surface(
                                modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp),
                                color = MapSurface
                            ) { MapLabel(message) }
                        }
                    }

                    if (!mapLoaded) {
                        MapNotice {
                            if (timedOut) {
                                MapLabel("Chưa xác nhận bản đồ tải xong", MapText)
                                MapLabel("Kiểm tra kết nối mạng và cấu hình Google Maps. Bạn vẫn có thể quay lại tổng quan.")
                                Button(
                                    onClick = retry,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = MapCyan,
                                        contentColor = MapBackground
                                    )
                                ) { Text("Thử lại") }
                            } else {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = MapCyan,
                                        strokeWidth = 2.dp
                                    )
                                    MapLabel("Đang tải bản đồ…")
                                }
                            }
                        }
                    }
                }
            }

            if (!embedded) {
                RescueBottomBar(
                selectedTab = RescueMainTab.MAP,
                onSos = onSosTab,
                onOverview = onOverviewTab ?: onBack,
                onSafeLocations = onSafeLocationsTab
            )
            }
        }
    }

    selectedHistoryPoint?.let { point ->
        RescueHistoryPointSheet(
            point = point,
            onFocus = {
                selectedHistoryPoint = null
                focusHistoryPoint = point.position
            },
            onDismiss = { selectedHistoryPoint = null }
        )
    }

    selectedHistoryPolygon?.let { polygon ->
        RescueHistoryPolygonSheet(
            polygon = polygon,
            onFocus = {
                selectedHistoryPolygon = null
                focusHistoryPolygon = polygon.outer
            },
            onDismiss = { selectedHistoryPolygon = null }
        )
    }

    if (showAreas) {
        RescueFloodAreaSheet(
            layers = layers,
            state = dataState,
            selectedAreaId = selectedAreaId,
            canFocus = mapLoaded && mapSize.width > 0 && mapSize.height > 0,
            onSelect = { selectedAreaId = it },
            onFocus = { area ->
                selectedAreaId = area.id
                focusAreaId = area.id
                showAreas = false
            },
            onRetryAreas = dataViewModel::retryFloodAreas,
            onRetryWarnings = warningViewModel::refreshActiveMapWarnings,
            onDismiss = { showAreas = false }
        )
    }
}

@Composable
private fun MapNotice(content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = MapSurface)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) { content() }
    }
}

@Composable
private fun MapLabel(text: String, color: Color = MapMuted) {
    Text(text = text, color = color, fontFamily = MapFont, fontSize = 13.sp, lineHeight = 20.sp)
}
