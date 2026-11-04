package com.example.floodguard.ui.screens.rescue

import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.floodguard.R
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberUpdatedMarkerState
import kotlinx.coroutines.delay
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
    location: RescueMapLocationController
) {
    BackHandler(onBack = onBack)
    val context = LocalContext.current
    var attempt by remember { mutableStateOf(0) }
    var mapLoaded by remember { mutableStateOf(false) }
    var timedOut by remember { mutableStateOf(false) }
    var showInformation by rememberSaveable { mutableStateOf(true) }
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

    Surface(modifier = Modifier.fillMaxSize(), color = MapBackground) {
        Column(modifier = Modifier.fillMaxSize().safeDrawingPadding()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Bản đồ cứu hộ",
                    modifier = Modifier.weight(1f),
                    fontFamily = MapFont,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = MapText
                )
                TextButton(onClick = { showInformation = !showInformation }) {
                    MapLabel(if (showInformation) "Ẩn" else "Thông tin", MapCyan)
                }
            }

            if (showInformation) {
                MapNotice {
                    MapLabel("Bản đồ nền khu vực Đà Nẵng", MapText)
                    MapLabel("Kéo để di chuyển, chụm hai ngón để thu/phóng. Không cần cấp quyền vị trí để xem.")
                    MapLabel("SOS, điểm an toàn và các lớp ngập sẽ được bổ sung sau.")
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val fix = location.state.fix
                Column(modifier = Modifier.weight(1f)) {
                    if (fix == null) {
                        MapLabel(location.state.message)
                    } else {
                        MapLabel(if (fix.isApproximate) "Vị trí gần đúng" else "Vị trí lần lấy gần nhất", MapCyan)
                        MapLabel(fix.accuracyMeters?.let {
                            "Độ chính xác khoảng ${ceil(it.toDouble()).toLong()} m"
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
                            modifier = Modifier.fillMaxSize(),
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
                            location.state.fix?.let { fix ->
                                val point = LatLng(fix.latitude, fix.longitude)
                                fix.accuracyMeters?.takeIf { it > 0f }?.let { accuracy ->
                                    Circle(
                                        center = point,
                                        radius = accuracy.toDouble(),
                                        fillColor = MapCyan.copy(alpha = 0.15f),
                                        strokeColor = MapCyan,
                                        strokeWidth = 2f
                                    )
                                }
                                Marker(
                                    state = rememberUpdatedMarkerState(position = point),
                                    title = "Vị trí cứu hộ (lần lấy gần nhất)",
                                    snippet = if (fix.isApproximate) "Vị trí gần đúng" else "Vị trí từ thiết bị",
                                    icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_CYAN)
                                )
                            }
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

            RescueBottomBar(
                selectedTab = RescueMainTab.MAP,
                onOverview = onBack
            )
        }
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
