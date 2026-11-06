package com.example.floodguard.ui.screens.map

import android.Manifest
import android.os.Looper
import android.os.SystemClock
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.location.LocationManager
import android.net.Uri
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.provider.Settings
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Sos
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton

import androidx.compose.material3.Switch
import androidx.compose.material3.AlertDialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.core.content.ContextCompat
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.core.app.ActivityCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.floodguard.ui.components.FloodGuardBottomBar
import com.example.floodguard.ui.navigation.AppRoutes
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.BitmapDescriptor
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.Marker
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationAvailability
import com.google.maps.android.compose.Polygon
import com.google.maps.android.compose.rememberUpdatedMarkerState
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// =====================================================
// COLORS
// =====================================================

private val MapBackground = Color(0xFF06111F)
private val MapHeader = Color(0xFF081522)
private val MapCard = Color(0xFF0B1726)
private val MapBorder = Color(0xFF1D3547)

private val MapText = Color(0xFFF4F7FA)
private val MapSecondary = Color(0xFF8FA6B8)

private val MapCyan = Color(0xFF00E5FF)
private val MapGreen = Color(0xFF16C784)
private val MapOrange = Color(0xFFFFA000)

private val CitizenFloodColor = Color(0xFFFFC107)
private val CitizenLowLyingColor = Color(0xFFEF9A9A)

// =====================================================
// ROUTE
// =====================================================

private fun buildCitizenMapBounds(
    state: FloodMapUiState
): LatLngBounds? {
    if (!state.isFloodLayerEnabled) return null

    val builder = LatLngBounds.Builder()
    var hasCoordinates = false

    state.citizenAreas.forEach { area ->
        area.vertices.forEach { vertex ->
            builder.include(
                LatLng(vertex.latitude, vertex.longitude)
            )
            hasCoordinates = true
        }
    }

    if (state.isHistoryPointsLayerEnabled) {
        state.historyPoints.forEach { point ->
            builder.include(
                LatLng(point.latitude, point.longitude)
            )
            hasCoordinates = true
        }
    }

    return if (hasCoordinates) builder.build() else null
}

private fun createHistoryPointIcon(
    context: Context
): BitmapDescriptor {
    val density = context.resources.displayMetrics.density
    val size = (18f * density).roundToInt()

    val bitmap = Bitmap.createBitmap(
        size,
        size,
        Bitmap.Config.ARGB_8888
    )

    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    val center = size / 2f

    // Viền trắng
    paint.color = android.graphics.Color.WHITE
    canvas.drawCircle(
        center,
        center,
        center - 1f,
        paint
    )

    // Tâm đỏ
    paint.color = android.graphics.Color.rgb(229, 57, 53)
    canvas.drawCircle(
        center,
        center,
        center - 2f * density,
        paint
    )

    return BitmapDescriptorFactory.fromBitmap(bitmap)
}

@Composable
fun FloodMapRoute(
    viewModel: FloodMapViewModel,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
    onSafeRouteClick: () -> Unit = {},
    onShelterDetailClick: (String) -> Unit = { _ -> },
    onSosClick: () -> Unit = {},
    onBottomNavigate: (String) -> Unit = {}
) {

    val state by viewModel.uiState.collectAsStateWithLifecycle()

    FloodMapScreen(
        state = state,
        onBack = onBack,
        onNotificationClick = onNotificationClick,
        onProfileClick = onProfileClick,
        onToggleFloodLayer = viewModel::toggleFloodLayer,
        onToggleUserLayer = viewModel::toggleUserLayer,
        onToggleShelterLayer = viewModel::toggleShelterLayer,
        onToggleSafeRouteLayer = viewModel::toggleSafeRouteLayer,
        onSafeRouteClick = onSafeRouteClick,
        onShelterDetailClick = onShelterDetailClick,
        onSosClick = onSosClick,
        onBottomNavigate = onBottomNavigate,
        onRetryFloodAreas = viewModel::loadFloodAreas,
        onSelectFloodAlert = viewModel::selectFloodAlert,
        onSelectSafeLocation = viewModel::selectSafeLocation,
        onRetryFloodAlerts = viewModel::loadFloodAlerts,
        onToggleHistoryPointsLayer = viewModel::toggleHistoryPointsLayer,
        onRetryHistoryPoints = viewModel::loadHistoryPoints,
        onToggleHistoryBuffersLayer = viewModel::toggleHistoryBuffersLayer,
        onRetryHistoryBuffers = viewModel::loadHistoryBuffers,
        onToggleHistoryRadarLayer = viewModel::toggleHistoryRadarLayer,
        onRetryHistoryRadar = viewModel::loadHistoryRadar,
        onRefreshMapData = viewModel::refreshMapData,
        onRetrySafeLocations = viewModel::loadSafeLocations,
        onSelectCitizenArea = viewModel::selectCitizenArea,
        onSelectHistoryPoint = viewModel::selectHistoryPoint,
        onClearMapSelection = viewModel::clearMapSelection,
        )
}

// =====================================================
// SCREEN
// =====================================================

@Composable
fun FloodMapScreen(
    state: FloodMapUiState,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit,
    onProfileClick: () -> Unit,
    onToggleFloodLayer: () -> Unit,
    onToggleUserLayer: () -> Unit,
    onToggleShelterLayer: () -> Unit,
    onToggleSafeRouteLayer: () -> Unit,
    onSafeRouteClick: () -> Unit,
    onShelterDetailClick: (String) -> Unit,
    onSelectSafeLocation: (String?) -> Unit,
    onSosClick: () -> Unit,
    onBottomNavigate: (String) -> Unit,
    onRetryFloodAreas: () -> Unit,
    onSelectFloodAlert: (String?) -> Unit,
    onRetryFloodAlerts: () -> Unit,
    onToggleHistoryPointsLayer: () -> Unit,
    onRetryHistoryPoints: () -> Unit,
    onToggleHistoryBuffersLayer: () -> Unit,
    onRetryHistoryBuffers: () -> Unit,
    onToggleHistoryRadarLayer: () -> Unit,
    onRetryHistoryRadar: () -> Unit,
    onRefreshMapData: () -> Unit,
    onRetrySafeLocations: () -> Unit,
    onSelectCitizenArea: (String?) -> Unit,
    onSelectHistoryPoint: (HistoricalFloodPoint?) -> Unit,
    onClearMapSelection: () -> Unit,
) {

    val scrollState = rememberScrollState()

    var isTouchingMap by remember {
        mutableStateOf(false)
    }

    Scaffold(
        containerColor = MapBackground,

        bottomBar = {
            FloodGuardBottomBar(
                currentRoute = AppRoutes.MAP,
                onNavigate = onBottomNavigate
            )
        }
    ) { innerPadding ->

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MapBackground)
                .padding(innerPadding)
                .verticalScroll(
                    state = scrollState,
                    enabled = !isTouchingMap
                )
        ) {

            FloodMapHeader(
                state = state,
                onBack = onBack,
                onNotificationClick = onNotificationClick,
                onProfileClick = onProfileClick
            )

            FloodGoogleMap(
                state = state,
                onSelectSafeLocation = onSelectSafeLocation,
                onSelectCitizenArea = onSelectCitizenArea,
                onSelectHistoryPoint = onSelectHistoryPoint,
                onClearMapSelection = onClearMapSelection,
                onMapTouchChanged = { isTouchingMap = it }
            )

            FloodLayerRow(
                state = state,
                onToggleFloodLayer = onToggleFloodLayer,
                onToggleUserLayer = onToggleUserLayer,
                onToggleShelterLayer = onToggleShelterLayer
            )

            CitizenMapDataPanel(
                state = state,
                onRefresh = onRefreshMapData,
                onRetryAreas = onRetryFloodAreas,
                onRetryAlerts = onRetryFloodAlerts,
                onRetryShelters = onRetrySafeLocations,
                onRetryHistory = onRetryHistoryPoints
            )

            val selectedSafeLocation =
                state.safeLocations.firstOrNull { location ->
                    state.isShelterLayerEnabled &&
                            location.id == state.selectedSafeLocationId &&
                            location.status.equals(
                                "active",
                                ignoreCase = true
                            )
                }

            selectedSafeLocation?.let { location ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 18.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = location.name,
                        color = MapText,
                        fontWeight = FontWeight.SemiBold
                    )

                    OutlinedButton(
                        onClick = {
                            onShelterDetailClick(location.id)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(
                            1.dp,
                            MapBorder
                        )
                    ) {
                        Text(
                            text = "Chi tiết điểm tránh trú",
                            color = MapText
                        )
                    }
                }
            }

            Spacer(
                modifier = Modifier.height(24.dp)
            )

        } // Column chính
    } // Scaffold
} // FloodMapScreen
// =====================================================
// HEADER
// =====================================================

@Composable
private fun FloodMapHeader(
    state: FloodMapUiState,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit,
    onProfileClick: () -> Unit
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MapHeader)
            .statusBarsPadding()
            .padding(
                horizontal = 8.dp,
                vertical = 8.dp
            ),

        verticalAlignment = Alignment.CenterVertically
    ) {

        IconButton(
            onClick = onBack
        ) {

            Text(
                text = "←",
                color = MapText,
                fontSize = 28.sp
            )
        }

        Column(
            modifier = Modifier.weight(1f)
        ) {

            Text(
                text = state.title,
                color = MapText,
                fontSize = 20.sp,
                fontWeight = FontWeight.Medium
            )

            Text(
                text = "Nguồn dữ liệu: FloodGuard API",
                color = MapSecondary,
                fontSize = 10.sp
            )
        }

        IconButton(
            onClick = onNotificationClick
        ) {

            Icon(
                imageVector = Icons.Default.Notifications,
                contentDescription = "Thông báo",
                tint = MapText
            )
        }

        IconButton(
            onClick = onProfileClick
        ) {

            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = "Cá nhân",
                tint = MapText
            )
        }
    }
}

// =====================================================
// GPS INFO
// =====================================================

@Composable
private fun FloodGpsInfo() {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                horizontal = 18.dp,
                vertical = 10.dp
            ),
        verticalAlignment = Alignment.CenterVertically
    ) {

        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(Color(0xFF12354A)),
            contentAlignment = Alignment.Center
        ) {

            Icon(
                imageVector = Icons.Default.MyLocation,
                contentDescription = null,
                tint = MapCyan,
                modifier = Modifier.size(20.dp)
            )
        }

        Spacer(
            modifier = Modifier.width(10.dp)
        )

        Column(
            modifier = Modifier.weight(1f)
        ) {

            Text(
                text = "Vị trí thiết bị",
                color = MapText,
                fontSize = 13.sp
            )

            Spacer(
                modifier = Modifier.height(2.dp)
            )

            Text(
                text = "FloodGuard sử dụng GPS để hiển thị vị trí của bạn trên bản đồ. Bạn vẫn có thể xem bản đồ khi không cấp quyền.",
                color = MapSecondary,
                fontSize = 10.sp
            )
        }
    }
}

// =====================================================
// LAYERS
// =====================================================


@Composable
private fun FloodLayerRow(
    state: FloodMapUiState,
    onToggleFloodLayer: () -> Unit,
    onToggleUserLayer: () -> Unit,
    onToggleShelterLayer: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        FloodLayerItem(
            text = "Vùng ngập",
            selected = state.isFloodLayerEnabled,
            onClick = onToggleFloodLayer
        )

        FloodLayerItem(
            text = "Vị trí của tôi",
            selected = state.isUserLayerEnabled,
            onClick = onToggleUserLayer
        )

        FloodLayerItem(
            text = "Điểm tránh trú",
            selected = state.isShelterLayerEnabled,
            onClick = onToggleShelterLayer
        )
    }
}

@Composable
private fun FloodLayerItem(
    text: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Text(
        text = text,
        color = if (selected) MapGreen else MapSecondary,
        fontSize = 13.sp,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(
                horizontal = 6.dp,
                vertical = 10.dp
            )
    )
}
// =====================================================
// GOOGLE MAP
// =====================================================

@SuppressLint("MissingPermission")
@Composable
private fun FloodGoogleMap(
    state: FloodMapUiState,
    onSelectSafeLocation: (String?) -> Unit,
    onSelectCitizenArea: (String?) -> Unit,
    onSelectHistoryPoint: (HistoricalFloodPoint?) -> Unit,
    onClearMapSelection: () -> Unit,
    onMapTouchChanged: (Boolean) -> Unit
) {

    val context = LocalContext.current

    val permissionPrefs =
        remember {
            context.getSharedPreferences(
                "location_permission_prefs",
                Context.MODE_PRIVATE
            )
        }

    var hasRequestedLocationPermissionBefore by remember {
        mutableStateOf(
            permissionPrefs.getBoolean(
                "has_requested_location_permission",
                false
            )
        )
    }

    val lifecycleOwner = LocalLifecycleOwner.current

    var isScreenActive by remember {
        mutableStateOf(false)
    }

    var isLocationServiceEnabled by remember {
        mutableStateOf(
            (context.getSystemService(LocationManager::class.java))
                ?.let { locationManager ->
                    locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                            locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
                } == true
        )
    }

    val defaultLocation = LatLng(
        16.0544,
        108.2022
    )

    val cameraPositionState =
        rememberCameraPositionState {
            position = CameraPosition.fromLatLngZoom(
                defaultLocation,
                12f
            )
        }


    var isMapLoaded by remember {
        mutableStateOf(false)
    }

    var hasAutoCenteredOnUser by remember {
        mutableStateOf(false)
    }

    var hasUserInteractedWithMap by remember {
        mutableStateOf(false)
    }

    var previousFloodLayer by remember {
        mutableStateOf(state.isFloodLayerEnabled)
    }

    LaunchedEffect(state.isFloodLayerEnabled) {
        if (previousFloodLayer != state.isFloodLayerEnabled) {
            hasUserInteractedWithMap = true
            previousFloodLayer = state.isFloodLayerEnabled
        }
    }

    val cameraScope = rememberCoroutineScope()

    var userLocation by remember {
        mutableStateOf<LatLng?>(null)
    }

    var lastValidGpsFixNanos by remember {
        mutableStateOf<Long?>(null)
    }

    var activeGpsCallback by remember {
        mutableStateOf<LocationCallback?>(null)
    }

    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ) == PackageManager.PERMISSION_GRANTED
        )
    }

    var permissionPermanentlyDenied by remember {
        mutableStateOf(false)
    }

    var locationMessage by remember {
        mutableStateOf("Đang kiểm tra quyền vị trí...")
    }

    // CCF-65: Trạng thái xử lý lỗi GPS
    var isGpsTimedOut by remember {
        mutableStateOf(false)
    }

    // Tăng giá trị để khởi động lại phiên theo dõi GPS khi người dùng thử lại
    var gpsRetryKey by remember {
        mutableIntStateOf(0)
    }

    // Đánh dấu đã nhận được tọa độ trong phiên theo dõi hiện tại
    var hasReceivedGpsLocation by remember {
        mutableStateOf(false)
    }

    val fusedLocationClient = remember {
        LocationServices.getFusedLocationProviderClient(context)
    }

    fun invalidateGpsPosition(
        message: String,
        timedOut: Boolean = false
    ) {
        userLocation = null
        lastValidGpsFixNanos = null
        hasReceivedGpsLocation = false
        isGpsTimedOut = timedOut
        locationMessage = message
    }

    val permissionLauncher =
        rememberLauncherForActivityResult(
            contract = ActivityResultContracts.RequestMultiplePermissions()
        ) { permissions ->

            hasLocationPermission =
                permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                        permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true

            val activity = context.findActivity()

            permissionPermanentlyDenied =
                !hasLocationPermission &&
                        hasRequestedLocationPermissionBefore &&
                        activity != null &&
                        !ActivityCompat.shouldShowRequestPermissionRationale(
                            activity,
                            Manifest.permission.ACCESS_FINE_LOCATION
                        ) &&
                        !ActivityCompat.shouldShowRequestPermissionRationale(
                            activity,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )

            if (!hasRequestedLocationPermissionBefore) {

                hasRequestedLocationPermissionBefore = true

                permissionPrefs.edit()
                    .putBoolean(
                        "has_requested_location_permission",
                        true
                    )
                    .apply()
            }

            locationMessage =
                when {

                    hasLocationPermission -> {
                        "Đang lấy vị trí hiện tại..."
                    }

                    permissionPermanentlyDenied -> {
                        "Quyền vị trí đã bị chặn. Vui lòng mở Cài đặt để cấp lại quyền."
                    }

                    else -> {
                        "Chưa được cấp quyền vị trí"
                    }
                }
        }


    LaunchedEffect(Unit) {
        if (
            !hasLocationPermission &&
            !hasRequestedLocationPermissionBefore
        ) {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    DisposableEffect(
        hasLocationPermission,
        isScreenActive,
        isLocationServiceEnabled,
        gpsRetryKey
    ) {
        invalidateGpsPosition(
            message = when {
                !hasLocationPermission && permissionPermanentlyDenied ->
                    "Quyền vị trí đã bị chặn. Vui lòng mở Cài đặt."

                !hasLocationPermission ->
                    "Chưa được cấp quyền vị trí"

                !isLocationServiceEnabled ->
                    "Dịch vụ vị trí đang tắt"

                !isScreenActive ->
                    "Vị trí sẽ được cập nhật khi quay lại bản đồ"

                else ->
                    "Đang lấy vị trí hiện tại..."
            }
        )

        if (
            !hasLocationPermission ||
            !isLocationServiceEnabled ||
            !isScreenActive
        ) {
            onDispose { }
        } else {
            var isCallbackActive = true
            val sessionStartNanos = SystemClock.elapsedRealtimeNanos()

            val locationCallback = object : LocationCallback() {

                private fun canUseCallback(): Boolean {
                    return isCallbackActive &&
                            activeGpsCallback === this &&
                            isScreenActive &&
                            hasLocationPermission &&
                            isLocationServiceEnabled &&
                            lifecycleOwner.lifecycle.currentState
                                .isAtLeast(Lifecycle.State.STARTED)
                }

                override fun onLocationResult(result: LocationResult) {
                    if (!canUseCallback()) return

                    val location = result.lastLocation
                    val nowNanos = SystemClock.elapsedRealtimeNanos()

                    val usable = location != null &&
                            isCitizenGpsFixUsable(
                                latitude = location.latitude,
                                longitude = location.longitude,
                                fixNanos = location.elapsedRealtimeNanos,
                                sessionStartNanos = sessionStartNanos,
                                nowNanos = nowNanos
                            )

                    if (com.example.floodguard.BuildConfig.DEBUG) {
                        android.util.Log.d(
                            "CitizenGps",
                            "accepted=$usable, " +
                                    "ageMs=${location?.let {
                                        (nowNanos - it.elapsedRealtimeNanos) / 1_000_000L
                                    }}, " +
                                    "sessionDeltaMs=${location?.let {
                                        (it.elapsedRealtimeNanos - sessionStartNanos) / 1_000_000L
                                    }}"
                        )
                    }

                    if (location == null || !usable) {
                        if (userLocation == null && !isGpsTimedOut) {
                            locationMessage = "Đang lấy vị trí..."
                        }
                        return
                    }

                    userLocation = LatLng(
                        location.latitude,
                        location.longitude
                    )

                    lastValidGpsFixNanos = location.elapsedRealtimeNanos
                    hasReceivedGpsLocation = true
                    isGpsTimedOut = false
                    locationMessage = "Đã cập nhật vị trí"
                }

                override fun onLocationAvailability(
                    availability: LocationAvailability
                ) {
                    if (!canUseCallback()) return

                    if (com.example.floodguard.BuildConfig.DEBUG) {
                        android.util.Log.d(
                            "CitizenGps",
                            "available=${availability.isLocationAvailable}, " +
                                    "hasFix=${userLocation != null}"
                        )
                    }

                    if (
                        !availability.isLocationAvailable &&
                        userLocation == null &&
                        !isGpsTimedOut
                    ) {
                        locationMessage = "Đang lấy vị trí..."
                    }
                }
            }

            activeGpsCallback = locationCallback

            val locationRequest = LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY,
                5000L
            )
                .setMinUpdateIntervalMillis(2000L)
                .build()

            try {
                fusedLocationClient.requestLocationUpdates(
                    locationRequest,
                    locationCallback,
                    Looper.getMainLooper()
                ).addOnFailureListener {
                    if (
                        isCallbackActive &&
                        activeGpsCallback === locationCallback &&
                        isScreenActive &&
                        hasLocationPermission &&
                        isLocationServiceEnabled
                    ) {
                        invalidateGpsPosition(
                            message = "Không thể lấy vị trí. Vui lòng thử lại.",
                            timedOut = true
                        )
                    }
                }
            } catch (error: SecurityException) {
                hasLocationPermission = false
                invalidateGpsPosition(
                    message = "Quyền vị trí không còn khả dụng. Vui lòng cấp lại."
                )
            }

            onDispose {
                isCallbackActive = false

                if (activeGpsCallback === locationCallback) {
                    activeGpsCallback = null
                }

                fusedLocationClient.removeLocationUpdates(locationCallback)
            }
        }
    }

    DisposableEffect(lifecycleOwner) {

        val observer =
            LifecycleEventObserver { _, event ->

                when (event) {

                    Lifecycle.Event.ON_START -> {
                        isScreenActive = true
                        gpsRetryKey++
                    }

                    Lifecycle.Event.ON_RESUME -> {

                        hasLocationPermission =
                            ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.ACCESS_FINE_LOCATION
                            ) == PackageManager.PERMISSION_GRANTED ||
                                    ContextCompat.checkSelfPermission(
                                        context,
                                        Manifest.permission.ACCESS_COARSE_LOCATION
                                    ) == PackageManager.PERMISSION_GRANTED

                        val locationManager =
                            context.getSystemService(
                                LocationManager::class.java
                            )

                        isLocationServiceEnabled =
                            locationManager?.let {
                                it.isProviderEnabled(
                                    LocationManager.GPS_PROVIDER
                                ) ||
                                        it.isProviderEnabled(
                                            LocationManager.NETWORK_PROVIDER
                                        )
                            } == true

                        permissionPermanentlyDenied =
                            !hasLocationPermission &&
                                    hasRequestedLocationPermissionBefore &&
                                    context.findActivity()?.let { activity ->

                                        !ActivityCompat.shouldShowRequestPermissionRationale(
                                            activity,
                                            Manifest.permission.ACCESS_FINE_LOCATION
                                        ) &&
                                                !ActivityCompat.shouldShowRequestPermissionRationale(
                                                    activity,
                                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                                )
                                    } == true
                    }

                    Lifecycle.Event.ON_STOP -> {
                        isScreenActive = false

                        val callback = activeGpsCallback
                        activeGpsCallback = null

                        if (callback != null) {
                            fusedLocationClient.removeLocationUpdates(callback)
                        }

                        invalidateGpsPosition(
                            message = "Vị trí sẽ được cập nhật khi quay lại bản đồ"
                        )
                    }

                    else -> Unit
                }
            }

        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    DisposableEffect(context) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(
                receiverContext: Context?,
                intent: Intent?
            ) {
                val manager = context.getSystemService(
                    LocationManager::class.java
                )

                val enabledNow = manager?.let {
                    it.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                            it.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
                } == true

                if (enabledNow == isLocationServiceEnabled) {
                    return
                }

                isLocationServiceEnabled = enabledNow
                val callback = activeGpsCallback
                activeGpsCallback = null

                if (callback != null) {
                    fusedLocationClient.removeLocationUpdates(callback)
                }

                invalidateGpsPosition(
                    message = if (isLocationServiceEnabled) {
                        "Đang lấy vị trí hiện tại..."
                    } else {
                        "Dịch vụ vị trí đang tắt"
                    }
                )

                gpsRetryKey++
            }
        }

        ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        onDispose {
            context.unregisterReceiver(receiver)
        }
    }

    // CCF-65: Timeout khi GPS không trả về tọa độ sau 15 giây
    LaunchedEffect(
        hasLocationPermission,
        isLocationServiceEnabled,
        isScreenActive,
        gpsRetryKey,
        lastValidGpsFixNanos,
        isGpsTimedOut
    ) {
        if (
            !hasLocationPermission ||
            !isLocationServiceEnabled ||
            !isScreenActive ||
            isGpsTimedOut
        ) {
            return@LaunchedEffect
        }

        val observedFix = lastValidGpsFixNanos
        val observedRetryKey = gpsRetryKey

        val referenceNanos =
            observedFix ?: SystemClock.elapsedRealtimeNanos()

        val elapsedMillis = (
                SystemClock.elapsedRealtimeNanos() - referenceNanos
                ).coerceAtLeast(0L) / 1_000_000L

        val remainingMillis = (
                CITIZEN_GPS_TIMEOUT_MILLIS - elapsedMillis
                ).coerceAtLeast(0L)

        delay(remainingMillis)

        if (
            hasLocationPermission &&
            isLocationServiceEnabled &&
            isScreenActive &&
            !isGpsTimedOut &&
            gpsRetryKey == observedRetryKey &&
            lastValidGpsFixNanos == observedFix
        ) {
            invalidateGpsPosition(
                message = "Chưa nhận được tọa độ mới. Vui lòng thử lại GPS.",
                timedOut = true
            )
        }
    }

    LaunchedEffect(
        isMapLoaded,
        isScreenActive,
        hasLocationPermission,
        isLocationServiceEnabled,
        state.isUserLayerEnabled,
        userLocation
    ) {
        val location = userLocation ?: return@LaunchedEffect

        if (
            !isMapLoaded ||
            !isScreenActive ||
            !hasLocationPermission ||
            !isLocationServiceEnabled ||
            !state.isUserLayerEnabled ||
            hasAutoCenteredOnUser ||
            hasUserInteractedWithMap
        ) {
            return@LaunchedEffect
        }



        cameraPositionState.move(
            CameraUpdateFactory.newLatLngZoom(
                location,
                16f
            )
        )

        hasAutoCenteredOnUser = true
    }

    val currentOnMapTouchChanged by rememberUpdatedState(onMapTouchChanged)

    DisposableEffect(Unit) {
        onDispose {
            currentOnMapTouchChanged(false)
        }
    }

    val canShowUserLocation =
        hasLocationPermission &&
                isLocationServiceEnabled &&
                isScreenActive &&
                state.isUserLayerEnabled &&
                userLocation != null &&
                !isGpsTimedOut

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(300.dp),

        shape = RoundedCornerShape(18.dp),

        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF071524)
        ),

        border = BorderStroke(
            1.dp,
            Color(0xFF10283B)
        )
    ) {

        Box(
            modifier = Modifier.fillMaxSize()
        ) {

            GoogleMap(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        awaitEachGesture {
                            awaitFirstDown(
                                requireUnconsumed = false,
                                pass = PointerEventPass.Initial
                            )

                            hasUserInteractedWithMap = true
                            currentOnMapTouchChanged(true)

                            try {
                                do {
                                    val event = awaitPointerEvent(
                                        pass = PointerEventPass.Initial
                                    )
                                } while (event.changes.any { it.pressed })
                            } finally {
                                currentOnMapTouchChanged(false)
                            }
                        }
                    },

                cameraPositionState = cameraPositionState,
                onMapLoaded = {
                    isMapLoaded = true
                },

                onMyLocationButtonClick = {
                    hasUserInteractedWithMap = true

                    val location = userLocation

                    if (
                        location != null &&
                        hasLocationPermission &&
                        isLocationServiceEnabled &&
                        isScreenActive &&
                        !isGpsTimedOut
                    ) {
                        cameraScope.launch {
                            cameraPositionState.animate(
                                CameraUpdateFactory.newLatLngZoom(location, 16f)
                            )
                        }
                    } else {
                        invalidateGpsPosition(
                            message = "Đang lấy vị trí hiện tại..."
                        )
                        gpsRetryKey++
                    }

                    true
                },

                properties = MapProperties(
                    isMyLocationEnabled = canShowUserLocation
                )
            ) {

                state.citizenAreas.forEach { area ->
                    key("citizen-area", area.id) {
                        val polygonPoints = remember(area.id, area.vertices) {
                            area.vertices.map { vertex ->
                                LatLng(vertex.latitude, vertex.longitude)
                            }
                        }

                        val color = when (area.areaType) {
                            CitizenAreaType.FLOOD -> CitizenFloodColor
                            CitizenAreaType.LOW_LYING -> CitizenLowLyingColor
                        }

                        Polygon(
                            points = polygonPoints,
                            fillColor = color.copy(alpha = 0.35f),
                            strokeColor = color,
                            strokeWidth = 3f,
                            zIndex = 10f,
                            visible = state.isFloodLayerEnabled,
                            clickable = state.isFloodLayerEnabled,
                            onClick = {
                                hasUserInteractedWithMap = true
                                onSelectCitizenArea(area.id)
                            }
                        )
                    }
                }

                val historyPointIcon = remember {
                    BitmapDescriptorFactory.defaultMarker(
                        BitmapDescriptorFactory.HUE_RED
                    )
                }

                state.historyPoints.forEachIndexed { index, point ->
                    key("history-point", point.id, index) {
                        Marker(
                            state = rememberUpdatedMarkerState(
                                position = LatLng(
                                    point.latitude,
                                    point.longitude
                                )
                            ),
                            title = point.name ?: "Ngập lịch sử",
                            snippet = "Dữ liệu lịch sử tham khảo",
                            icon = historyPointIcon,
                            anchor = Offset(0.5f, 1f),
                            zIndex = 30f,
                            visible = state.isFloodLayerEnabled &&
                                    state.isHistoryPointsLayerEnabled,
                            onClick = {
                                hasUserInteractedWithMap = true
                                onSelectHistoryPoint(point)
                                true
                            }
                        )
                    }
                }

                val shelterPointIcon = remember {
                    BitmapDescriptorFactory.defaultMarker(
                        BitmapDescriptorFactory.HUE_AZURE
                    )
                }

                // CCF-71: Hiển thị Safe Locations từ Backend.
                // Marker chỉ là dữ liệu thử nghiệm/chưa xác minh.
                // Không dùng để quyết định sơ tán.
                state.safeLocations
                    .filter { safeLocation ->
                        safeLocation.status.equals(
                            "active",
                            ignoreCase = true
                        ) &&
                                safeLocation.location.latitude.isFinite() &&
                                safeLocation.location.longitude.isFinite() &&
                                safeLocation.location.latitude in -90.0..90.0 &&
                                safeLocation.location.longitude in -180.0..180.0
                    }
                    .forEach { safeLocation ->

                        val markerPosition = LatLng(
                            safeLocation.location.latitude,
                            safeLocation.location.longitude
                        )

                        val markerState = rememberUpdatedMarkerState(
                            position = markerPosition
                        )

                        Marker(
                            state = markerState,
                            icon = shelterPointIcon,
                            title = safeLocation.name,
                            snippet = "Chưa xác minh mức độ an toàn " +
                                    "và khả năng tiếp nhận hiện tại",
                            visible = state.isShelterLayerEnabled,
                            onClick = {
                                onSelectSafeLocation(safeLocation.id)
                                false
                            }
                        )
                    }

            }

            if (
                state.isUserLayerEnabled &&
                (
                        !hasLocationPermission ||
                                !isLocationServiceEnabled ||
                                userLocation == null ||
                                isGpsTimedOut
                        )
            ) {

                Column(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 12.dp)
                        .background(
                            Color.Black.copy(alpha = 0.75f),
                            RoundedCornerShape(8.dp)
                        )
                        .padding(
                            horizontal = 12.dp,
                            vertical = 8.dp
                        ),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {

                    Text(
                        text = locationMessage,
                        color = Color.White,
                        fontSize = 11.sp
                    )

                    if (!hasLocationPermission) {

                        Spacer(
                            modifier = Modifier.height(8.dp)
                        )

                        OutlinedButton(
                            onClick = {

                                if (permissionPermanentlyDenied) {

                                    val intent =
                                        Intent(
                                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                            Uri.parse(
                                                "package:${context.packageName}"
                                            )
                                        )

                                    context.startActivity(intent)

                                } else {

                                    permissionLauncher.launch(
                                        arrayOf(
                                            Manifest.permission.ACCESS_FINE_LOCATION,
                                            Manifest.permission.ACCESS_COARSE_LOCATION
                                        )
                                    )
                                }
                            }
                        ) {

                            Text(
                                text =
                                    if (permissionPermanentlyDenied) {
                                        "Mở Cài đặt"
                                    } else {
                                        "Cấp quyền vị trí"
                                    },
                                color = Color.White,
                                fontSize = 10.sp
                            )
                        }
                    } else if (
                        hasLocationPermission &&
                        isLocationServiceEnabled &&
                        isGpsTimedOut
                    ) {
                        Spacer(
                            modifier = Modifier.height(8.dp)
                        )

                        OutlinedButton(
                            onClick = {
                                isGpsTimedOut = false
                                hasReceivedGpsLocation = false
                                gpsRetryKey++
                            }
                        ) {
                            Text(
                                text = "Thử lại GPS",
                                color = Color.White,
                                fontSize = 10.sp
                            )
                        }
                    }
                }
            }
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {

        val hasMapGeometry = state.isFloodLayerEnabled &&
                (
                        state.citizenAreas.isNotEmpty() ||
                                (
                                        state.isHistoryPointsLayerEnabled &&
                                                state.historyPoints.isNotEmpty()
                                        )
                        )

        OutlinedButton(
            enabled = isMapLoaded && hasMapGeometry,
            onClick = {
                hasUserInteractedWithMap = true

                cameraScope.launch {
                    val bounds = withContext(Dispatchers.Default) {
                        buildCitizenMapBounds(state)
                    }

                    if (bounds != null) {
                        cameraPositionState.animate(
                            CameraUpdateFactory.newLatLngBounds(
                                bounds,
                                36
                            )
                        )
                    }
                }
            },
            colors = ButtonDefaults.outlinedButtonColors(
                containerColor = Color(0xD9000000),
                contentColor = Color.White
            )
        ) {
            Text(
                text = "Xem toàn vùng dữ liệu",
                fontSize = 11.sp
            )
        }
    }
    CitizenMapSelectionDialog(
        state = state,
        canShowOnMap = isMapLoaded,
        onDismiss = onClearMapSelection,
        onShowArea = { area ->
            hasUserInteractedWithMap = true

            val builder = LatLngBounds.Builder()
            area.vertices.forEach { vertex ->
                builder.include(
                    LatLng(vertex.latitude, vertex.longitude)
                )
            }
            val bounds = builder.build()

            onClearMapSelection()

            cameraScope.launch {
                cameraPositionState.animate(
                    CameraUpdateFactory.newLatLngBounds(bounds, 48)
                )
            }
        },
        onShowPoint = { point ->
            hasUserInteractedWithMap = true
            onClearMapSelection()

            cameraScope.launch {
                cameraPositionState.animate(
                    CameraUpdateFactory.newLatLngZoom(
                        LatLng(point.latitude, point.longitude),
                        16f
                    )
                )
            }
        }
    )
}


// =====================================================
// AREA SUMMARY
// =====================================================

@Composable
private fun FloodAreaSummary(
    state: FloodMapUiState
) {

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
    ) {

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {

            Text(
                text = "DỮ LIỆU NGẬP MINH HỌA",
                color = MapSecondary,
                fontSize = 9.sp
            )

            Text(
                text = "  •  ${state.monitoredSubArea}",
                color = MapSecondary,
                fontSize = 9.sp,
                modifier = Modifier.weight(1f)
            )

            Text(
                text = state.alertLevel,
                color = MapOrange,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,

                modifier = Modifier
                    .background(
                        MapOrange.copy(alpha = 0.15f),
                        RoundedCornerShape(6.dp)
                    )
                    .padding(
                        horizontal = 8.dp,
                        vertical = 5.dp
                    )
            )
        }

        Spacer(
            modifier = Modifier.height(6.dp)
        )

        Text(
            text = "Thông tin bên dưới chưa được lấy từ API thời gian thực",
            color = MapSecondary,
            fontSize = 9.sp
        )

        Spacer(
            modifier = Modifier.height(6.dp)
        )

        Text(
            text = state.monitoredArea
                .lowercase()
                .replaceFirstChar {
                    it.uppercase()
                },

            color = MapText,
            fontSize = 18.sp
        )

        Spacer(
            modifier = Modifier.height(18.dp)
        )

        Row(
            modifier = Modifier.fillMaxWidth()
        ) {

            FloodMetric(
                modifier = Modifier.weight(1f),
                title = "Mực ngập dự kiến",
                value = state.expectedFloodDepth,
                note = state.expectedFloodTrend,
                valueColor = MapText,
                noteColor = MapOrange
            )

            FloodMetric(
                modifier = Modifier.weight(1f),
                title = state.riverName,
                value = state.riverLevel,
                note = state.riverLevelNote,
                valueColor = MapText,
                noteColor = MapSecondary
            )

            FloodMetric(
                modifier = Modifier.weight(1f),
                title = "Trạm trú gần nhất",
                value = state.nearestShelterDistance,
                note = state.nearestShelterNote,
                valueColor = MapGreen,
                noteColor = MapSecondary
            )
        }
    }
}

@Composable
private fun FloodMetric(
    modifier: Modifier,
    title: String,
    value: String,
    note: String,
    valueColor: Color,
    noteColor: Color
) {

    Column(
        modifier = modifier
    ) {

        Text(
            text = title,
            color = MapSecondary,
            fontSize = 9.sp
        )

        Spacer(
            modifier = Modifier.height(6.dp)
        )

        Text(
            text = value,
            color = valueColor,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold
        )

        Spacer(
            modifier = Modifier.height(4.dp)
        )

        Text(
            text = note,
            color = noteColor,
            fontSize = 9.sp
        )
    }
}

// =====================================================
// SHELTER
// =====================================================

@Composable
private fun FloodShelterCard(
    state: FloodMapUiState
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),

        colors = CardDefaults.cardColors(
            containerColor = Color.Transparent
        )
    ) {

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),

            verticalAlignment =
                Alignment.Top
        ) {

            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(
                        RoundedCornerShape(10.dp)
                    )
                    .background(
                        MapGreen.copy(alpha = 0.15f)
                    ),

                contentAlignment =
                    Alignment.Center
            ) {

                Icon(
                    imageVector =
                        Icons.Default.Apartment,

                    contentDescription = null,

                    tint = MapGreen
                )
            }

            Spacer(
                modifier = Modifier.width(10.dp)
            )

            Column(
                modifier = Modifier.weight(1f)
            ) {

                Row(
                    modifier = Modifier.fillMaxWidth()
                ) {

                    Text(
                        text = "Điểm sơ tán minh họa: ${state.shelterName}",
                        color = MapText,
                        fontSize = 14.sp,
                        modifier = Modifier.weight(1f)
                    )

                    Text(
                        text = state.shelterCapacity,
                        color = MapGreen,
                        fontSize = 10.sp
                    )
                }

                Spacer(
                    modifier = Modifier.height(4.dp)
                )

                Text(
                    text = state.shelterDescription,
                    color = MapSecondary,
                    fontSize = 11.sp,
                    lineHeight = 16.sp
                )
            }
        }
    }
}

// =====================================================
// FLOOD SEVERITY LEGEND
// =====================================================


@Composable
private fun FloodHistoryPointLegend(
    text: String = "Điểm lịch sử"
) {
    Row(
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(12.dp)
                .clip(CircleShape)
                .background(Color(0xFFE53935))
                .border(
                    width = 1.dp,
                    color = Color.White,
                    shape = CircleShape
                )
        )

        Spacer(modifier = Modifier.width(5.dp))

        Text(
            text = text,
            color = MapSecondary,
            fontSize = 10.sp
        )
    }
}

@Composable
private fun FloodSeverityLegend(
    color: Color,
    text: String
) {
    Row(
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(color)
        )

        Spacer(
            modifier = Modifier.width(5.dp)
        )

        Text(
            text = text,
            color = MapSecondary,
            fontSize = 10.sp
        )
    }
}

private fun floodSeverityLabel(severity: String): String {
    return when (severity.trim().lowercase()) {
        "low" -> "Thấp"
        "medium" -> "Trung bình"
        "high" -> "Cao"
        "critical" -> "Nghiêm trọng"
        else -> "Chưa xác định"
    }
}

@Composable
private fun FloodWarningInfoCard(
    title: String,
    content: String,
    severity: String
) {

    val severityColor =
        when (severity.trim().lowercase()) {
            "low" -> Color(0xFF4CAF50)
            "medium" -> Color(0xFFFFA000)
            "high" -> Color(0xFFF44336)
            "critical" -> Color(0xFFB71C1C)
            else -> MapSecondary
        }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                horizontal = 18.dp,
                vertical = 8.dp
            ),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MapCard
        ),
        border = BorderStroke(
            1.dp,
            severityColor.copy(alpha = 0.6f)
        )
    ) {

        Column(
            modifier = Modifier.padding(14.dp)
        ) {

            Text(
                text = title,
                color = MapText,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(
                modifier = Modifier.height(6.dp)
            )

            Text(
                text = content,
                color = MapSecondary,
                fontSize = 11.sp,
                lineHeight = 16.sp
            )

            Spacer(
                modifier = Modifier.height(8.dp)
            )

            Text(
                text = "Mức độ: ${floodSeverityLabel(severity)}",
                color = severityColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

private fun Context.findActivity(): Activity? {

    var currentContext = this

    while (currentContext is ContextWrapper) {

        if (currentContext is Activity) {
            return currentContext
        }

        currentContext = currentContext.baseContext
    }

    return null
}
@Composable
private fun CitizenMapDataPanel(
    state: FloodMapUiState,
    onRefresh: () -> Unit,
    onRetryAreas: () -> Unit,
    onRetryAlerts: () -> Unit,
    onRetryShelters: () -> Unit,
    onRetryHistory: () -> Unit
) {
    val busy = state.isLoadingFloodAreas ||
            state.isLoadingFloodAlerts ||
            state.isLoadingSafeLocations ||
            state.isLoadingHistoryPoints ||
            state.isLoadingHistoryBuffers ||
            state.isLoadingHistoryRadar

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (state.isFloodLayerEnabled) {
            Text(
                text = "CHÚ GIẢI BẢN ĐỒ",
                color = MapText,
                fontWeight = FontWeight.SemiBold
            )

            CitizenLegendItem(
                label = "Ngập lịch sử (${state.historyPoints.size})",
                color = Color.Red,
                isPoint = true
            )

            CitizenLegendItem(
                label = "Vùng ngập (${
                    state.citizenAreas.count {
                        it.areaType == CitizenAreaType.FLOOD
                    }
                })",
                color = CitizenFloodColor
            )

            CitizenLegendItem(
                label = "Vùng trũng (${
                    state.citizenAreas.count {
                        it.areaType == CitizenAreaType.LOW_LYING
                    }
                })",
                color = CitizenLowLyingColor
            )

            Text(
                text = "Màu phân biệt loại dữ liệu, không thể hiện " +
                        "mức độ nguy hiểm. Ngập lịch sử là dữ liệu tham khảo, " +
                        "không phải cảnh báo ngập hiện tại.",
                color = MapSecondary,
                fontSize = 12.sp
            )
        }

        OutlinedButton(
            onClick = onRefresh,
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = MapText
            )
        ) {
            Text(
                if (busy) "Đang tải dữ liệu..."
                else "Làm mới dữ liệu"
            )
        }

        Text(
            text = "Nguồn: FloodGuard API. Thời gian bên dưới " +
                    "là lúc ứng dụng tải thành công.",
            color = MapSecondary,
            fontSize = 12.sp
        )

        CitizenSourceStatus(
            title = "Vùng ngập và vùng trũng",
            count = state.citizenAreas.size,
            loading = state.isLoadingFloodAreas,
            error = state.floodAreasError,
            loadedAt = state.floodAreasLoadedAt,
            onRetry = onRetryAreas
        )

        if (state.floodAreasUnsupportedTypeCount > 0) {
            Text(
                text = "Có ${state.floodAreasUnsupportedTypeCount} vùng " +
                        "chưa xác định được loại dữ liệu nên chưa hiển thị.",
                color = MapOrange,
                fontSize = 12.sp
            )
        }

        if (state.floodAreasInvalidRecordCount > 0) {
            Text(
                text = "Có ${state.floodAreasInvalidRecordCount} " +
                        "bản ghi vùng không hợp lệ nên chưa hiển thị.",
                color = MapOrange,
                fontSize = 12.sp
            )
        }

        CitizenSourceStatus(
            title = "Ngập lịch sử",
            count = state.historyPoints.size,
            loading = state.isLoadingHistoryPoints,
            error = state.historyPointsError,
            loadedAt = state.historyPointsLoadedAt,
            onRetry = onRetryHistory
        )

        if (state.historyPointsInvalidFeatureCount > 0) {
            Text(
                text = "Đã bỏ qua ${state.historyPointsInvalidFeatureCount} " +
                        "bản ghi lịch sử không hợp lệ.",
                color = MapOrange,
                fontSize = 12.sp
            )
        }

        CitizenSourceStatus(
            title = "Điểm tránh trú",
            count = state.safeLocations.count {
                it.status.equals("active", ignoreCase = true)
            },
            loading = state.isLoadingSafeLocations,
            error = state.safeLocationsError,
            loadedAt = state.safeLocationsLoadedAt,
            onRetry = onRetryShelters
        )

        CitizenSourceStatus(
            title = "Bản tin cảnh báo",
            count = state.floodAlerts.size,
            loading = state.isLoadingFloodAlerts,
            error = state.floodAlertsError,
            loadedAt = state.floodAlertsLoadedAt,
            onRetry = onRetryAlerts
        )
    }
}

@Composable
private fun CitizenSourceStatus(
    title: String,
    count: Int,
    loading: Boolean,
    error: String?,
    loadedAt: Long?,
    onRetry: () -> Unit
) {
    val loadedText = remember(loadedAt) {
        loadedAt?.let {
            SimpleDateFormat(
                "dd/MM/yyyy HH:mm:ss",
                Locale.forLanguageTag("vi-VN")
            ).format(Date(it))
        }
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = "$title: $count",
            color = MapText,
            fontSize = 13.sp
        )

        if (loading) {
            Text(
                text = "Đang tải; dữ liệu đã có vẫn được giữ hiển thị.",
                color = MapSecondary,
                fontSize = 12.sp
            )
        }

        Text(
            text = loadedText?.let { "Đã tải: $it" }
                ?: "Chưa tải thành công.",
            color = MapSecondary,
            fontSize = 11.sp
        )

        if (error != null) {
            Text(
                text = error,
                color = Color(0xFFEF9A9A),
                fontSize = 12.sp
            )

            OutlinedButton(
                onClick = onRetry,
                enabled = !loading,
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MapText
                )
            ) {
                Text("Thử lại")
            }
        }
    }
}

@Composable
private fun CitizenLegendItem(
    label: String,
    color: Color,
    isPoint: Boolean = false
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (isPoint) {
            Icon(
                imageVector = Icons.Default.LocationOn,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(18.dp)
            )
        } else {
            Box(
                modifier = Modifier
                    .size(14.dp)
                    .background(color)
            )
        }

        Text(
            text = label,
            color = MapText,
            fontSize = 12.sp
        )
    }
}

@Composable
private fun CitizenMapSelectionDialog(
    state: FloodMapUiState,
    canShowOnMap: Boolean,
    onDismiss: () -> Unit,
    onShowArea: (CitizenMapArea) -> Unit,
    onShowPoint: (HistoricalFloodPoint) -> Unit
) {
    val area = state.citizenAreas.firstOrNull {
        state.isFloodLayerEnabled &&
                it.id == state.selectedCitizenAreaId
    }

    val point = state.selectedHistoryPoint?.takeIf {
        state.isFloodLayerEnabled &&
                state.isHistoryPointsLayerEnabled
    }

    if (area == null && point == null) return

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MapCard,
        title = {
            Text(
                text = area?.name ?: point?.name ?: "Thông tin bản đồ",
                color = MapText
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 360.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (area != null) {
                    CitizenInfoLine("Loại dữ liệu", area.areaType.label)
                    CitizenInfoLine("ID", area.id)
                    CitizenInfoLine("Tên", area.name)
                    CitizenInfoLine("Mô tả", area.description)
                    CitizenInfoLine("Nguồn", area.source)

                    state.floodAreasError?.let {
                        Text(
                            text = "Thông tin vùng đang lấy từ lần tải trước.",
                            color = MapOrange,
                            fontSize = 12.sp
                        )
                    }

                    val relatedAlerts = state.floodAlerts.filter {
                        it.areaId == area.id
                    }

                    if (relatedAlerts.isNotEmpty()) {
                        Text(
                            text = "ĐỢT CẢNH BÁO LIÊN QUAN",
                            color = MapText,
                            fontWeight = FontWeight.SemiBold
                        )

                        state.floodAlertsError?.let {
                            Text(
                                text = "Bản tin cảnh báo chưa được làm mới.",
                                color = MapOrange,
                                fontSize = 12.sp
                            )
                        }

                        relatedAlerts.forEach { alert ->
                            FloodWarningInfoCard(
                                title = alert.title,
                                content = alert.content,
                                severity = alert.severity
                            )
                        }
                    }
                }

                if (point != null) {
                    CitizenInfoLine("Loại dữ liệu", "Ngập lịch sử")
                    CitizenInfoLine("ID", point.id)
                    CitizenInfoLine("Tên", point.name)
                    CitizenInfoLine("Nguồn", point.sourceUrl)
                    CitizenInfoLine(
                        "Nguồn tham chiếu vị trí",
                        point.locationRefUrl
                    )
                    CitizenInfoLine("Giai đoạn dữ liệu", point.dataPeriod)

                    CitizenInfoLine(
                        "Thông tin tọa độ",
                        when (point.coordinateStatus) {
                            "landmark_reference" ->
                                "Tọa độ tham chiếu theo địa danh"

                            "historical_reference_estimated" ->
                                "Tọa độ lịch sử ước lượng"

                            else -> point.coordinateStatus
                        }
                    )

                    CitizenInfoLine(
                        "Tọa độ",
                        "${point.latitude}, ${point.longitude}"
                    )

                    Text(
                        text = "Dữ liệu lịch sử phục vụ tham khảo, " +
                                "không xác nhận khu vực đang ngập hoặc an toàn.",
                        color = MapSecondary,
                        fontSize = 12.sp
                    )

                    state.historyPointsError?.let {
                        Text(
                            text = "Thông tin điểm đang lấy từ lần tải trước.",
                            color = MapOrange,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = canShowOnMap,
                onClick = {
                    if (area != null) {
                        onShowArea(area)
                    } else if (point != null) {
                        onShowPoint(point)
                    }
                }
            ) {
                Text("Xem trên bản đồ", color = MapText)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Đóng", color = MapText)
            }
        }
    )
}

@Composable
private fun CitizenInfoLine(
    label: String,
    value: String?
) {
    Text(
        text = "$label: ${
            value?.takeIf { it.isNotBlank() }
                ?: "Chưa được bổ sung"
        }",
        color = MapText,
        fontSize = 13.sp
    )
}
