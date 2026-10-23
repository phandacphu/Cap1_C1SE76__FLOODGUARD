package com.example.floodguard.ui.screens.map

import android.Manifest
import android.os.Looper
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.location.LocationManager
import android.net.Uri
import android.provider.Settings
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Sos
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.compose.runtime.DisposableEffect
import androidx.core.app.ActivityCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.floodguard.ui.components.FloodGuardBottomBar
import com.example.floodguard.ui.navigation.AppRoutes
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.maps.android.compose.Polygon

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

// =====================================================
// ROUTE
// =====================================================

@Composable
fun FloodMapRoute(
    viewModel: FloodMapViewModel,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
    onSafeRouteClick: () -> Unit = {},
    onShelterDetailClick: () -> Unit = {},
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
        onRetryFloodAlerts = viewModel::loadFloodAlerts,
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
    onShelterDetailClick: () -> Unit,
    onSosClick: () -> Unit,
    onBottomNavigate: (String) -> Unit,
    onRetryFloodAreas: () -> Unit,
    onSelectFloodAlert: (String?) -> Unit,
    onRetryFloodAlerts: () -> Unit,
) {

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
                    rememberScrollState()
                )
        ) {

            FloodMapHeader(
                state = state,
                onBack = onBack,
                onNotificationClick = onNotificationClick,
                onProfileClick = onProfileClick
            )

            FloodGpsInfo()

            Spacer(
                modifier = Modifier.height(10.dp)
            )

            FloodLayerRow(
                state = state,
                onToggleFloodLayer = onToggleFloodLayer,
                onToggleUserLayer = onToggleUserLayer,
                onToggleShelterLayer = onToggleShelterLayer
            )

            Spacer(
                modifier = Modifier.height(12.dp)
            )

            FloodGoogleMap(
                state = state,
                onSelectFloodAlert = onSelectFloodAlert
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        horizontal = 18.dp,
                        vertical = 8.dp
                    ),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {

                FloodSeverityLegend(
                    color = Color(0xFF4CAF50),
                    text = "Thấp"
                )

                FloodSeverityLegend(
                    color = Color(0xFFFFA000),
                    text = "Trung bình"
                )

                FloodSeverityLegend(
                    color = Color(0xFFB71C1C),
                    text = "Critical"
                )

                FloodSeverityLegend(
                    color = Color(0xFFF44336),
                    text = "Cao"
                )
            }

            if (state.isLoadingFloodAreas) {

                Text(
                    text = "Đang tải dữ liệu vùng ngập...",
                    color = MapSecondary,
                    fontSize = 11.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = 18.dp,
                            vertical = 8.dp
                        )
                )

            } else if (state.floodAreasError != null) {

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = 18.dp,
                            vertical = 8.dp
                        ),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {

                    Text(
                        text = "Không thể tải vùng ngập: ${state.floodAreasError}",
                        color = Color(0xFFE57373),
                        fontSize = 11.sp
                    )

                    Spacer(
                        modifier = Modifier.height(8.dp)
                    )

                    OutlinedButton(
                        onClick = onRetryFloodAreas
                    ) {

                        Text(
                            text = "Thử lại",
                            color = MapText
                        )
                    }
                }

            } else if (state.floodAreas.isEmpty()) {

                Text(
                    text = "Hiện chưa có dữ liệu vùng ngập.",
                    color = MapSecondary,
                    fontSize = 11.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = 18.dp,
                            vertical = 8.dp
                        )
                )
            }

            if (state.isLoadingFloodAlerts) {

                Text(
                    text = "Đang tải cảnh báo đang hoạt động...",
                    color = MapSecondary,
                    fontSize = 11.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = 18.dp,
                            vertical = 8.dp
                        )
                )

            } else if (state.floodAlertsError != null) {

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = 18.dp,
                            vertical = 8.dp
                        ),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {

                    Text(
                        text = "Không thể tải cảnh báo: ${state.floodAlertsError}",
                        color = Color(0xFFE57373),
                        fontSize = 11.sp
                    )

                    Spacer(
                        modifier = Modifier.height(8.dp)
                    )

                    OutlinedButton(
                        onClick = onRetryFloodAlerts
                    ) {

                        Text(
                            text = "Thử lại",
                            color = MapText
                        )
                    }
                }
            }

            val selectedFloodAlert =
                state.floodAlerts.firstOrNull { alert ->
                    alert.id == state.selectedFloodAlertId
                }

            selectedFloodAlert?.let { alert ->

                FloodWarningInfoCard(
                    title = alert.title,
                    content = alert.content,
                    severity = alert.severity
                )
            }

            Spacer(
                modifier = Modifier.height(20.dp)
            )

            FloodAreaSummary(
                state = state
            )

            Spacer(
                modifier = Modifier.height(18.dp)
            )

            Text(
                text = "Các điểm trú trên bản đồ hiện là dữ liệu thử nghiệm. " +
                        "Chưa xác minh mức độ an toàn, sức chứa hoặc khả năng tiếp nhận.",
                color = MapSecondary,
                fontSize = 11.sp,
                lineHeight = 16.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 8.dp)
            )

            Spacer(
                modifier = Modifier.height(18.dp)
            )
            /*
            Button(
                onClick = onSafeRouteClick,

                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp)
                    .height(54.dp),

                shape = RoundedCornerShape(12.dp),

                colors = ButtonDefaults.buttonColors(
                    containerColor = MapCard,
                    contentColor = MapText
                )
            ) {

                Icon(
                    imageVector = Icons.Default.Navigation,
                    contentDescription = null,
                    tint = MapText
                )

                Spacer(
                    modifier = Modifier.width(8.dp)
                )

                Text(
                    text = "CHỈ ĐƯỜNG AN TOÀN",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }
            */


            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp),

                horizontalArrangement =
                    Arrangement.spacedBy(12.dp)
            ) {

                OutlinedButton(
                    onClick = onShelterDetailClick,

                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),

                    shape = RoundedCornerShape(12.dp),

                    border = BorderStroke(
                        1.dp,
                        MapBorder
                    )
                ) {

                    Text(
                        text = "Chi tiết trạm trú",
                        color = MapText
                    )
                }

                Button(
                    onClick = onSosClick,

                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),

                    shape = RoundedCornerShape(12.dp),

                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFE53935)
                    )
                ) {

                    Icon(
                        imageVector = Icons.Default.Sos,
                        contentDescription = null,
                        tint = Color.White
                    )

                    Spacer(
                        modifier = Modifier.width(6.dp)
                    )

                    Text(
                        text = "PHÁT SOS",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp
                    )
                }
            }

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
                text = "Dữ liệu minh họa • Chưa kết nối dữ liệu thời gian thực",
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
                text = "GPS được lấy khi người dùng cấp quyền vị trí",
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
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FloodLayerItem(
            text = "Vùng ngập",
            selected = state.isFloodLayerEnabled,
            onClick = onToggleFloodLayer
        )

        FloodLayerItem(
            text = "Vị trí bạn",
            selected = state.isUserLayerEnabled,
            onClick = onToggleUserLayer
        )

        FloodLayerItem(
            text = "Điểm trú",
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

        color = if (selected) {
            MapGreen
        } else {
            MapSecondary
        },

        fontSize = 11.sp,

        modifier = Modifier
            .clickable {
                onClick()
            }
            .padding(6.dp)
    )
}
// =====================================================
// GOOGLE MAP
// =====================================================

@SuppressLint("MissingPermission")
@Composable
private fun FloodGoogleMap(
    state: FloodMapUiState,
    onSelectFloodAlert: (String?) -> Unit
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

    var userLocation by remember {
        mutableStateOf<LatLng?>(null)
    }

    var hasCenteredOnUserLocation by remember {
        mutableStateOf(false)
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

    val fusedLocationClient = remember {
        LocationServices.getFusedLocationProviderClient(context)
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

        if (!hasLocationPermission) {
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
        isLocationServiceEnabled
    ) {

        if (!hasLocationPermission) {

            locationMessage =
                if (permissionPermanentlyDenied) {
                    "Quyền vị trí đã bị chặn. Vui lòng mở Cài đặt để cấp lại quyền."
                } else {
                    "Chưa được cấp quyền vị trí"
                }

            onDispose { }

        } else if (!isLocationServiceEnabled) {

            locationMessage =
                "Dịch vụ vị trí đang tắt"

            onDispose { }

        } else if (!isScreenActive) {

            onDispose { }

        } else {

            locationMessage =
                "Đang theo dõi vị trí hiện tại..."

            val locationRequest =
                LocationRequest.Builder(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    5000L
                )
                    .setMinUpdateIntervalMillis(
                        2000L
                    )
                    .build()

            val locationCallback =
                object : LocationCallback() {

                    override fun onLocationResult(
                        result: LocationResult
                    ) {

                        val location =
                            result.lastLocation

                        if (location == null) {

                            locationMessage =
                                "Chưa có dữ liệu vị trí"

                            return
                        }

                        userLocation =
                            LatLng(
                                location.latitude,
                                location.longitude
                            )

                        locationMessage =
                            "Đã cập nhật vị trí"
                    }
                }

            fusedLocationClient
                .requestLocationUpdates(
                    locationRequest,
                    locationCallback,
                    Looper.getMainLooper()
                )
                .addOnFailureListener {

                    locationMessage =
                        "Không thể lấy vị trí hiện tại"
                }

            onDispose {

                fusedLocationClient
                    .removeLocationUpdates(
                        locationCallback
                    )
            }
        }
    }

    DisposableEffect(lifecycleOwner) {

        val observer =
            LifecycleEventObserver { _, event ->

                when (event) {

                    Lifecycle.Event.ON_START -> {
                        isScreenActive = true
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
                    }

                    else -> Unit
                }
            }

        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(userLocation) {

        val location = userLocation

        if (
            location != null &&
            !hasCenteredOnUserLocation
        ) {

            cameraPositionState.animate(
                CameraUpdateFactory.newLatLngZoom(
                    location,
                    16f
                )
            )

            hasCenteredOnUserLocation = true
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(430.dp),

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
                modifier = Modifier.fillMaxSize(),
                cameraPositionState = cameraPositionState,
                properties = MapProperties(
                    isMyLocationEnabled =
                        hasLocationPermission &&
                                isLocationServiceEnabled &&
                                state.isUserLayerEnabled
                )
            ) {

                if (state.isFloodLayerEnabled) {

                    state.floodAreas
                        .filter {
                            it.geometry.type.equals(
                                "polygon",
                                ignoreCase = true
                            ) &&
                                    it.status.equals(
                                        "active",
                                        ignoreCase = true
                                    )
                        }
                        .forEach { floodArea ->


                            val rawPoints = floodArea.geometry.points

                            val hasValidCoordinates =
                                rawPoints.all { point ->
                                    point.latitude.isFinite() &&
                                            point.longitude.isFinite() &&
                                            point.latitude in -90.0..90.0 &&
                                            point.longitude in -180.0..180.0
                                }

                            val hasEnoughDistinctPoints =
                                rawPoints
                                    .map { point ->
                                        point.latitude to point.longitude
                                    }
                                    .distinct()
                                    .size >= 3

                            if (hasValidCoordinates && hasEnoughDistinctPoints) {

                                val polygonPoints = rawPoints.map { point ->
                                    LatLng(
                                        point.latitude,
                                        point.longitude
                                    )
                                }


                                val fillColor =
                                    when (
                                        floodArea.severity.lowercase()
                                    ) {

                                        "critical" ->
                                            Color(0x66B71C1C)

                                        "high" ->
                                            Color(0x66F44336)

                                        "medium" ->
                                            Color(0x66FFA000)

                                        "low" ->
                                            Color(0x664CAF50)

                                        else ->
                                            Color(0x665F6368)
                                    }

                                val strokeColor =
                                    when (
                                        floodArea.severity.lowercase()
                                    ) {

                                        "critical" ->
                                            Color(0xFFB71C1C)

                                        "high" ->
                                            Color(0xFFF44336)

                                        "medium" ->
                                            Color(0xFFFFA000)

                                        "low" ->
                                            Color(0xFF4CAF50)

                                        else ->
                                            Color(0xFF5F6368)
                                    }

                                val matchingAlert =
                                    state.floodAlerts
                                        .filter { alert ->
                                            alert.areaId == floodArea.id
                                        }
                                        .maxByOrNull { alert ->
                                            when (alert.severity.lowercase()) {
                                                "critical" -> 4
                                                "high" -> 3
                                                "medium" -> 2
                                                "low" -> 1
                                                else -> 0
                                            }
                                        }

                                Polygon(
                                    points = polygonPoints,
                                    fillColor = fillColor,
                                    strokeColor = strokeColor,
                                    strokeWidth = 4f,
                                    clickable = true,
                                    onClick = {
                                        onSelectFloodAlert(
                                            matchingAlert?.id
                                        )
                                    }
                                )
                            }
                        }
                }

                if (state.isUserLayerEnabled) {
                    userLocation?.let { location ->
                        Marker(
                            state = MarkerState(
                                position = location
                            ),
                            title = "Vị trí của bạn"
                        )
                    }
                }

                // CCF-71: Hiển thị Safe Locations từ Backend.
                // Marker chỉ là dữ liệu thử nghiệm/chưa xác minh.
                // Không dùng để quyết định sơ tán.
                if (state.isShelterLayerEnabled) {
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

                            Marker(
                                state = MarkerState(
                                    position = LatLng(
                                        safeLocation.location.latitude,
                                        safeLocation.location.longitude
                                    )
                                ),
                                title = safeLocation.name,
                                snippet = "DỮ LIỆU THỬ NGHIỆM — " +
                                        "Chưa xác minh điểm tránh trú"
                            )
                        }
                }

            }

            if (
                !hasLocationPermission ||
                !isLocationServiceEnabled ||
                userLocation == null
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
                    }
                }
            }
        }
    }
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

@Composable
private fun FloodWarningInfoCard(
    title: String,
    content: String,
    severity: String
) {

    val severityColor =
        when (severity.lowercase()) {
            "high" -> Color(0xFFF44336)
            "medium" -> Color(0xFFFFA000)
            "low" -> Color(0xFF4CAF50)
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
                text = "Mức độ: ${severity.uppercase()}",
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
