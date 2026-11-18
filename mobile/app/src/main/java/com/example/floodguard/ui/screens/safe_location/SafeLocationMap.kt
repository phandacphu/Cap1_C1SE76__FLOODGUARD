package com.example.floodguard.ui.screens.safe_location

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.location.Location
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.floodguard.domain.model.SafeLocation
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.maps.android.compose.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout

@SuppressLint("MissingPermission")
@Composable
fun SafeLocationMap(
    locations: List<SafeLocation>,
    isLoadingLocations: Boolean,
    locationError: String?,
    gps: Location?,
    onGpsChanged: (Location?) -> Unit,
    onViewDetail: (String) -> Unit,
    onMapTouchChanged: (Boolean) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentGpsCallback by rememberUpdatedState(onGpsChanged)
    val currentTouchCallback by rememberUpdatedState(onMapTouchChanged)

    val locationClient = remember(context) {
        LocationServices.getFusedLocationProviderClient(context)
    }

    var gpsMessage by remember {
        mutableStateOf("Đang kiểm tra quyền vị trí…")
    }
    var locating by remember { mutableStateOf(false) }
    var requestNumber by remember { mutableIntStateOf(0) }
    var mapLoaded by remember { mutableStateOf(false) }
    var didSetInitialCamera by rememberSaveable { mutableStateOf(false) }
    var requestedCameraTarget by remember { mutableStateOf<LatLng?>(null) }

    fun hasLocationPermission(): Boolean {
        return listOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ).any {
            ContextCompat.checkSelfPermission(
                context,
                it
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.any { it }) {
            requestNumber++
        } else {
            gpsMessage = "Chưa được cấp quyền vị trí. Vẫn có thể xem điểm tránh trú."
            currentGpsCallback(null)
        }
    }

    fun requestLocation() {
        if (hasLocationPermission()) {
            requestNumber++
        } else {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner, context) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && !hasLocationPermission()) {
                requestNumber = 0
                currentGpsCallback(null)
                gpsMessage = "Chưa được cấp quyền vị trí. Vẫn có thể xem điểm tránh trú."
            }
        }

        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(Unit) {
        if (hasLocationPermission() && gps != null) {
            gpsMessage = "Theo vị trí lần cuối"
        } else {
            currentGpsCallback(null)
            requestLocation()
        }
    }

    fun showLocationFailure(message: String) {
        if (!hasLocationPermission()) {
            currentGpsCallback(null)
            gpsMessage = "Chưa có quyền truy cập vị trí."
        } else {
            gpsMessage = if (gps != null) "Theo vị trí lần cuối" else message
        }
    }

    LaunchedEffect(requestNumber) {
        if (requestNumber == 0) return@LaunchedEffect

        locating = true
        gpsMessage = "Đang lấy vị trí GPS…"

        val cancellation = CancellationTokenSource()

        try {
            val result = withTimeout(30_000L) {
                locationClient.getCurrentLocation(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    cancellation.token
                ).await()
            }

            val ageNanos = result?.let {
                SystemClock.elapsedRealtimeNanos() -
                        it.elapsedRealtimeNanos
            }

            val valid = result != null &&
                    result.latitude.isFinite() &&
                    result.longitude.isFinite() &&
                    result.latitude in -90.0..90.0 &&
                    result.longitude in -180.0..180.0 &&
                    ageNanos != null &&
                    ageNanos in 0L..60_000_000_000L

            if (valid && hasLocationPermission()) {
                currentGpsCallback(result)
                requestedCameraTarget = result?.let {
                    LatLng(it.latitude, it.longitude)
                }
                gpsMessage = "Đã lấy vị trí thiết bị."
            } else {
                showLocationFailure("Chưa lấy được vị trí mới. Bật GPS rồi bấm Vị trí của tôi.")
            }
        } catch (_: TimeoutCancellationException) {
            showLocationFailure("Lấy GPS quá thời gian. Vui lòng thử lại.")
        } catch (error: CancellationException) {
            throw error
        } catch (_: SecurityException) {
            currentGpsCallback(null)
            gpsMessage = "Chưa có quyền truy cập vị trí."
        } catch (_: Exception) {
            showLocationFailure("Không thể lấy vị trí. Kiểm tra GPS và thử lại.")
        } finally {
            cancellation.cancel()
            locating = false
        }
    }

    val validLocations = locations.filter {
        it.latitude.isFinite() &&
                it.longitude.isFinite() &&
                it.latitude in -90.0..90.0 &&
                it.longitude in -180.0..180.0
    }

    val shelterPositions = validLocations.map {
        LatLng(it.latitude, it.longitude)
    }

    val userPosition = gps?.let {
        LatLng(it.latitude, it.longitude)
    }

    val camera = rememberCameraPositionState {
        // Khung nhìn tổng quan Việt Nam, không phải vị trí giả.
        position = CameraPosition.fromLatLngZoom(
            LatLng(16.0, 106.0),
            5f
        )
    }

    fun showAll() {
        val positions = shelterPositions
        if (positions.isEmpty()) return

        scope.launch {
            val distinct = positions.distinct()
            if (distinct.size == 1) {
                camera.animate(
                    CameraUpdateFactory.newLatLngZoom(
                        distinct.single(),
                        14f
                    )
                )
            } else {
                val bounds = LatLngBounds.Builder()
                distinct.forEach { bounds.include(it) }

                camera.animate(
                    CameraUpdateFactory.newLatLngBounds(
                        bounds.build(),
                        64
                    )
                )
            }
        }
    }

    LaunchedEffect(mapLoaded, requestedCameraTarget) {
        val target = requestedCameraTarget ?: return@LaunchedEffect
        if (!mapLoaded || !hasLocationPermission()) return@LaunchedEffect

        didSetInitialCamera = true
        camera.move(CameraUpdateFactory.newLatLngZoom(target, 16f))
        requestedCameraTarget = null
    }

    LaunchedEffect(mapLoaded, shelterPositions.isNotEmpty()) {
        if (!mapLoaded || didSetInitialCamera || shelterPositions.isEmpty()) {
            return@LaunchedEffect
        }

        didSetInitialCamera = true
        if (gps == null && requestedCameraTarget == null) {
            showAll()
        }
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        GoogleMap(
            modifier = Modifier
                .fillMaxWidth()
                .height(320.dp)
                .clip(RoundedCornerShape(18.dp))
                .pointerInput(Unit) {
                    awaitEachGesture {
                        awaitFirstDown(
                            requireUnconsumed = false,
                            pass = PointerEventPass.Initial
                        )
                        currentTouchCallback(true)

                        try {
                            do {
                                val event = awaitPointerEvent(
                                    pass = PointerEventPass.Initial
                                )
                            } while (event.changes.any { it.pressed })
                        } finally {
                            currentTouchCallback(false)
                        }
                    }
                },
            cameraPositionState = camera,
            uiSettings = MapUiSettings(
                myLocationButtonEnabled = false,
                zoomControlsEnabled = true
            ),
            onMapLoaded = { mapLoaded = true }
        ) {
            userPosition?.let { position ->
                Marker(
                    state = rememberUpdatedMarkerState(position),
                    title = "Vị trí của tôi",
                    snippet = "Vị trí ghi nhận từ thiết bị",
                    icon = BitmapDescriptorFactory.defaultMarker(
                        BitmapDescriptorFactory.HUE_AZURE
                    )
                )
            }

            validLocations.forEach { location ->
                key(location.id) {
                    Marker(
                        state = rememberUpdatedMarkerState(
                            LatLng(
                                location.latitude,
                                location.longitude
                            )
                        ),
                        title = location.name,
                        icon = BitmapDescriptorFactory.defaultMarker(
                            BitmapDescriptorFactory.HUE_GREEN
                        ),
                        onClick = {
                            onViewDetail(location.id)
                            true
                        }
                    )
                }
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = { requestLocation() },
                enabled = !locating,
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    if (locating) "Đang lấy GPS…" else "Vị trí của tôi",
                    color = Color(0xFF39D9E8)
                )
            }

            OutlinedButton(
                onClick = { showAll() },
                enabled = mapLoaded && shelterPositions.isNotEmpty(),
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    "Xem toàn bộ",
                    color = Color(0xFF39D9E8)
                )
            }
        }

        Text(
            text = gpsMessage,
            color = Color(0xFF9CAFC0)
        )

        Text(
            text = when {
                isLoadingLocations -> "Đang tải điểm tránh trú…"
                locationError != null -> locationError
                validLocations.isEmpty() ->
                    "Chưa có điểm tránh trú từ API để hiển thị trên bản đồ."
                else ->
                    "${validLocations.size} điểm tránh trú • Ghim xanh lá là điểm tránh trú, ghim xanh dương là vị trí của bạn."
            },
            color = Color(0xFF9CAFC0)
        )
    }
}