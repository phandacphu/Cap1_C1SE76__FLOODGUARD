package com.example.floodguard.ui.screens.rescue

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.floodguard.data.repository.RescueCatalogGps
import com.example.floodguard.data.repository.RescueCatalogLocation
import com.google.android.gms.maps.CameraUpdate
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberUpdatedMarkerState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val ShelterMapSurface = Color(0xFF122131)
private val ShelterMapText = Color(0xFFD4E4FA)
private val ShelterMapCyan = Color(0xFF8AEBFF)

@Composable
internal fun RescueSafeLocationsMap(
    locations: List<RescueCatalogLocation>,
    allLocations: List<RescueCatalogLocation>,
    userGps: RescueCatalogGps?,
    gpsCenterRequestId: Long,
    onOpenDetail: (String) -> Unit,
    onShowAll: () -> Unit,
    onRequestLocation: () -> Unit,
    modifier: Modifier = Modifier
) {
    val userPosition = userGps
        ?.takeIf { it.isValid() }
        ?.let { LatLng(it.latitude, it.longitude) }

    val points = remember(locations) {
        locations.map {
            LatLng(it.latitude, it.longitude)
        }
    }
    val allPoints = remember(allLocations) {
        allLocations.map { LatLng(it.latitude, it.longitude) }
    }

    if (points.isEmpty() && allPoints.isEmpty() && userPosition == null) {
        Surface(
            modifier = modifier
                .fillMaxWidth()
                .height(320.dp),
            color = ShelterMapSurface,
            shape = RoundedCornerShape(14.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    text = "Chưa có địa điểm hoặc vị trí để hiển thị trên bản đồ.",
                    color = ShelterMapText,
                    modifier = Modifier.padding(20.dp)
                )
            }
        }
        return
    }

    val initialPosition =
        points.firstOrNull()
            ?: allPoints.firstOrNull()
            ?: userPosition
            ?: LatLng(16.0544, 108.2022)

    val camera = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(
            initialPosition,
            12f
        )
    }

    val scope = rememberCoroutineScope()

    var mapLoaded by remember { mutableStateOf(false) }
    var timedOut by remember { mutableStateOf(false) }
    var initialBoundsApplied by remember { mutableStateOf(false) }
    // Await a NEW successful GPS request, not the previously saved location.
    var awaitingGpsResultFromId by remember { mutableStateOf<Long?>(null) }

    LaunchedEffect(mapLoaded) {
        if (!mapLoaded) {
            delay(15_000)
            timedOut = true
        } else {
            timedOut = false
        }
    }

    // Fit once when the map first receives locations.
    // Data refresh must not reset the user's camera position.
    LaunchedEffect(mapLoaded, points.isNotEmpty()) {
        if (
            mapLoaded &&
            !initialBoundsApplied &&
            points.isNotEmpty()
        ) {
            initialBoundsApplied = true
            camera.animate(
                shelterCameraUpdate(points),
                durationMs = 450
            )
        }
    }

    // The Rescue GPS controller changes this ID on a successful new fix.
    // A cached position A must not consume the request to center on new fix B.
    LaunchedEffect(
        mapLoaded,
        userPosition,
        gpsCenterRequestId,
        awaitingGpsResultFromId
    ) {
        val requestStartedAfterId = awaitingGpsResultFromId
        if (
            mapLoaded &&
            requestStartedAfterId != null &&
            gpsCenterRequestId != 0L &&
            gpsCenterRequestId != requestStartedAfterId &&
            userPosition != null
        ) {
            camera.animate(
                CameraUpdateFactory.newLatLngZoom(userPosition, 15f),
                durationMs = 450
            )
            awaitingGpsResultFromId = null
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(350.dp)
    ) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = camera,
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false
            ),
            onMapLoaded = {
                mapLoaded = true
            }
        ) {
            // Blue marker: Rescue's permitted GPS position.
            userPosition?.let { position ->
                Marker(
                    state = rememberUpdatedMarkerState(
                        position = position
                    ),
                    title = "Vị trí của tôi",
                    icon = BitmapDescriptorFactory.defaultMarker(
                        BitmapDescriptorFactory.HUE_AZURE
                    ),
                    onClick = { true }
                )
            }

            // Green markers: Backend v2 safe locations.
            locations.forEach { location ->
                key(location.id) {
                    Marker(
                        state = rememberUpdatedMarkerState(
                            position = LatLng(
                                location.latitude,
                                location.longitude
                            )
                        ),
                        title = location.name,
                        snippet = location.address,
                        icon = BitmapDescriptorFactory.defaultMarker(
                            BitmapDescriptorFactory.HUE_GREEN
                        ),
                        onClick = {
                            onOpenDetail(location.id)
                            true
                        }
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = {
                    initialBoundsApplied = true
                    // Remember the last successful request. Only a NEW ID
                    // can complete this centering request.
                    awaitingGpsResultFromId = gpsCenterRequestId

                    // Immediate feedback at cached location A (if available).
                    // The effect above will subsequently center on fresh B.
                    if (mapLoaded && userPosition != null) {
                        scope.launch {
                            camera.animate(
                                CameraUpdateFactory.newLatLngZoom(
                                    userPosition,
                                    15f
                                ),
                                durationMs = 450
                            )
                        }
                    }

                    onRequestLocation()
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = ShelterMapSurface,
                    contentColor = ShelterMapText
                ),
                contentPadding = PaddingValues(
                    horizontal = 12.dp,
                    vertical = 8.dp
                )
            ) {
                Text("Vị trí của tôi")
            }

            Button(
                onClick = {
                    if (mapLoaded && allPoints.isNotEmpty()) {
                        initialBoundsApplied = true
                        // Show All overrides any pending My Location centering.
                        awaitingGpsResultFromId = null
                        // Clear search so all pins and the search field agree.
                        onShowAll()
                        scope.launch {
                            camera.animate(
                                shelterCameraUpdate(allPoints),
                                durationMs = 450
                            )
                        }
                    }
                },
                enabled = mapLoaded && allPoints.isNotEmpty(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ShelterMapSurface,
                    contentColor = ShelterMapCyan
                ),
                contentPadding = PaddingValues(
                    horizontal = 12.dp,
                    vertical = 8.dp
                )
            ) {
                Text("Xem toàn bộ")
            }
        }

        if (!mapLoaded) {
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(12.dp),
                color = ShelterMapSurface,
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(
                    text = if (timedOut) {
                        "Chưa tải được bản đồ. Bạn vẫn có thể xem danh sách."
                    } else {
                        "Đang tải bản đồ..."
                    },
                    color = ShelterMapText,
                    modifier = Modifier.padding(12.dp)
                )
            }
        }
    }
}

private fun shelterCameraUpdate(
    points: List<LatLng>
): CameraUpdate {
    val uniquePoints = points.distinctBy {
        it.latitude to it.longitude
    }

    return if (uniquePoints.size == 1) {
        CameraUpdateFactory.newLatLngZoom(
            uniquePoints.first(),
            14f
        )
    } else {
        val bounds = LatLngBounds.Builder().apply {
            uniquePoints.forEach { include(it) }
        }.build()

        CameraUpdateFactory.newLatLngBounds(
            bounds,
            70
        )
    }
}
