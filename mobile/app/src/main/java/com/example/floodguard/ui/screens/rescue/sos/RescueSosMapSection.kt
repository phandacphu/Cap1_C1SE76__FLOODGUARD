package com.example.floodguard.ui.screens.rescue.sos

import android.content.pm.PackageManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberUpdatedMarkerState
import kotlinx.coroutines.CancellationException

/** SOS pins belong on the SOS tab, not the Rescue flood-map tab. */
@Composable
internal fun RescueSosMapSection(
    items: List<RescueSos>,
    filter: SosFilter,
    loading: Boolean,
    onOpen: (String) -> Unit
) {
    var expanded by rememberSaveable { mutableStateOf(true) }
    val pins = items.mapNotNull { sos ->
        val point = sos.location?.takeIf { it.isValid() } ?: return@mapNotNull null
        sos to LatLng(point.latitude!!, point.longitude!!)
    }
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(if (filter == SosFilter.ACTIVE) "Bản đồ SOS đang chờ (${pins.size})"
            else "Bản đồ SOS đã cứu (${pins.size})")
        TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "Thu gọn" else "Hiện bản đồ") }
    }
    if (!expanded) return

    val context = LocalContext.current
    val hasMapsKey = remember(context) {
        runCatching {
            val appInfo = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
            val key = appInfo.metaData?.getString("com.google.android.geo.API_KEY")?.trim().orEmpty()
            key.isNotEmpty() && !key.contains("YOUR_", ignoreCase = true) &&
                !key.contains("DEFAULT_API_KEY", ignoreCase = true) && !key.contains("\${")
        }.getOrDefault(false)
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (!hasMapsKey) {
            Text("Chưa cấu hình Google Maps cho màn hình SOS. Danh sách vẫn dùng được.")
        } else {
            val initial = pins.firstOrNull()?.second ?: LatLng(16.0544, 108.2022)
            val camera = rememberCameraPositionState {
                position = CameraPosition.fromLatLngZoom(initial, 12f)
            }
            var loaded by remember { mutableStateOf(false) }
            var size by remember { mutableStateOf(IntSize.Zero) }
            val coordinates = pins.map { it.second }
            LaunchedEffect(loaded, size, coordinates) {
                if (!loaded || size.width <= 0 || size.height <= 0 || coordinates.isEmpty())
                    return@LaunchedEffect
                if (coordinates.size == 1) {
                    camera.position = CameraPosition.fromLatLngZoom(coordinates.first(), 15f)
                } else {
                    try {
                        val bounds = LatLngBounds.builder().apply { coordinates.forEach { include(it) } }.build()
                        camera.move(CameraUpdateFactory.newLatLngBounds(bounds, size.width, size.height, 32))
                    } catch (error: CancellationException) {
                        throw error
                    } catch (_: Exception) {
                        camera.position = CameraPosition.fromLatLngZoom(coordinates.first(), 12f)
                    }
                }
            }
            GoogleMap(
                modifier = Modifier.fillMaxWidth().height(180.dp).onSizeChanged { size = it },
                cameraPositionState = camera,
                properties = MapProperties(isMyLocationEnabled = false),
                uiSettings = MapUiSettings(
                    myLocationButtonEnabled = false,
                    mapToolbarEnabled = false,
                    zoomControlsEnabled = true
                ),
                onMapLoaded = { loaded = true }
            ) {
                pins.forEach { (sos, coordinate) ->
                    Marker(
                        state = rememberUpdatedMarkerState(position = coordinate),
                        title = "SOS ${sos.id}",
                        snippet = "Bấm để xem chi tiết",
                        icon = BitmapDescriptorFactory.defaultMarker(
                            if (filter == SosFilter.ACTIVE) BitmapDescriptorFactory.HUE_ORANGE
                            else BitmapDescriptorFactory.HUE_GREEN
                        ),
                        onClick = { onOpen(sos.id); true }
                    )
                }
            }
            if (pins.isEmpty()) Text(if (loading) "Đang tải vị trí SOS…" else "Chưa có SOS có tọa độ hợp lệ trong bộ lọc này.")
        }
    }
}
