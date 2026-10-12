package com.example.floodguard.ui.screens.map

import android.Manifest
import android.os.Looper
import android.annotation.SuppressLint
import android.content.pm.PackageManager
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
        onBottomNavigate = onBottomNavigate
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
    onBottomNavigate: (String) -> Unit
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

            /*
            FloodLayerRow(
                state = state,
                onToggleFloodLayer = onToggleFloodLayer,
                onToggleUserLayer = onToggleUserLayer,
                onToggleShelterLayer = onToggleShelterLayer,
                onToggleSafeRouteLayer = onToggleSafeRouteLayer
            )

            Spacer(
                modifier = Modifier.height(12.dp)
            )
            */

            FloodGoogleMap()

            Spacer(
                modifier = Modifier.height(20.dp)
            )

            FloodAreaSummary(
                state = state
            )

            Spacer(
                modifier = Modifier.height(18.dp)
            )

            FloodShelterCard(
                state = state
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
    onToggleShelterLayer: () -> Unit,
    onToggleSafeRouteLayer: () -> Unit
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp),

        horizontalArrangement =
            Arrangement.SpaceBetween
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

        FloodLayerItem(
            text = "Tuyến an toàn",
            selected = state.isSafeRouteLayerEnabled,
            onClick = onToggleSafeRouteLayer
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
private fun FloodGoogleMap() {

    val context = LocalContext.current

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

            locationMessage =
                if (hasLocationPermission) {
                    "Đang lấy vị trí hiện tại..."
                } else {
                    "Chưa được cấp quyền vị trí"
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

    DisposableEffect(hasLocationPermission) {

        if (!hasLocationPermission) {

            locationMessage =
                "Chưa được cấp quyền vị trí"

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
                                ?: return

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

            onDispose {

                fusedLocationClient
                    .removeLocationUpdates(
                        locationCallback
                    )
            }
        }
    }

    LaunchedEffect(userLocation) {

        userLocation?.let { location ->

            cameraPositionState.animate(
                CameraUpdateFactory.newLatLngZoom(
                    location,
                    16f
                )
            )
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
                    isMyLocationEnabled = hasLocationPermission
                )
            ) {

                userLocation?.let { location ->

                    Marker(
                        state = MarkerState(
                            position = location
                        ),
                        title = "Vị trí của bạn"
                    )
                }
            }

            if (!hasLocationPermission || userLocation == null) {

                Text(
                    text = locationMessage,
                    color = Color.White,
                    fontSize = 11.sp,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 12.dp)
                        .background(
                            Color.Black.copy(alpha = 0.70f),
                            RoundedCornerShape(8.dp)
                        )
                        .padding(
                            horizontal = 12.dp,
                            vertical = 7.dp
                        )
                )
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