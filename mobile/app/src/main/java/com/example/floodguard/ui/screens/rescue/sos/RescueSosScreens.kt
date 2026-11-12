package com.example.floodguard.ui.screens.rescue.sos

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.example.floodguard.R
import com.example.floodguard.data.remote.dto.rescue.sos.SosPoint
import com.example.floodguard.ui.screens.rescue.RescueBottomBar
import com.example.floodguard.ui.screens.rescue.RescueMainTab
import com.example.floodguard.ui.screens.rescue.RescueMapLocationController
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val SosBg = Color(0xFF051424)
private val SosPanel = Color(0xFF122131)
private val SosText = Color(0xFFD4E4FA)
private val SosAccent = Color(0xFF8AEBFF)
private val SosFont = FontFamily(Font(R.font.rescue_be_vietnam_regular))

@Composable
internal fun RescueSosRefresh(store: RescueSosStore, filter: SosFilter = SosFilter.ACTIVE, detailId: String? = null) {
    val owner = LocalLifecycleOwner.current
    LaunchedEffect(store, owner, filter, detailId) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                if (store.state.value.accessError != null) break
                store.refresh(filter)
                if (detailId != null) store.openDetail(detailId)
                if (filter != SosFilter.ACTIVE ||
                    (detailId != null && store.state.value.detail.data?.state == "rescued")) break
                delay(30_000)
            }
        }
    }
}

@Composable
internal fun RescueSosListScreen(store: RescueSosStore, filter: SosFilter,
    rescueLocation: RescueMapLocationController?, distanceRepository: RescueRouteDistanceRepository?,
    onFilterChange: (SosFilter) -> Unit, onOpen: (String) -> Unit,
    onOverview: () -> Unit, onMap: () -> Unit) {
    val state by store.state.collectAsStateWithLifecycle()
    val resource = state.list(filter)
    val ordering = rememberRescueSosRoadOrdering(resource.data.orEmpty(), filter,
        rescueLocation, distanceRepository)
    RescueSosRefresh(store, filter)
    SosFrame("Yêu cầu SOS", onOverview, onMap) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SosFilter.entries.forEach { value ->
                FilterChip(selected = filter == value, onClick = { onFilterChange(value) },
                    label = { SosLabel(value.label) })
            }
        }
        if (state.accessError != null) {
            SosLabel(state.accessError!!)
            SosLabel("Quay về Tổng quan để đăng xuất và đăng nhập lại.")
        } else {
            RescueSosMapSection(items = ordering.items, filter = filter,
                loading = resource.loading, onOpen = onOpen)
            if (filter == SosFilter.ACTIVE && resource.data?.isNotEmpty() == true) {
                if (ordering.message.isNotBlank()) SosLabel(ordering.message)
                if (ordering.canRetry) {
                    TextButton(onClick = ordering.onRetry) { Text("Thử sắp xếp lại") }
                } else if (ordering.needsGps && rescueLocation != null && !rescueLocation.state.isLoading) {
                    TextButton(onClick = rescueLocation.locate) { Text("Lấy GPS Rescue") }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { store.refresh(filter) }, enabled = !resource.loading) { Text("Làm mới") }
                if (resource.loading) CircularProgressIndicator(modifier = Modifier.size(24.dp), color = SosAccent)
            }
            resource.error?.let { SosLabel("Chưa thể cập nhật. $it") }
            if (resource.error != null && resource.data != null) SosLabel("Đang giữ dữ liệu lần tải trước; vị trí có thể đã cũ.")
            if (resource.data?.isEmpty() == true && resource.error == null)
                SosLabel(if (filter == SosFilter.ACTIVE) "Chưa có SOS đang chờ cứu." else "Chưa có SOS đã cứu.")
            LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(ordering.items, key = { it.id }) { item ->
                    Surface(color = SosPanel, shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth().clickable { onOpen(item.id) }) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            SosLabel("SOS ${item.id}", bold = true)
                            if (filter == SosFilter.ACTIVE && ordering.distances != null) {
                                val meters = ordering.distances[item.id]
                                SosLabel(if (meters != null)
                                    "Đường ô tô dự kiến: " + String.format(Locale.forLanguageTag("vi-VN"), "%.1f km", meters / 1000.0)
                                    else "Đường ô tô dự kiến: Chưa xác định", accent = true)
                            }
                            SosLabel(if (item.state == "rescued") "Đã cứu" else "Đang chờ cứu", accent = true)
                            SosLabel("Số người: ${item.numberOfPeople?.toString() ?: "Chưa có thông tin"}")
                            SosLabel(item.situations.takeIf { it.isNotEmpty() }?.joinToString(" • ", transform = ::situationLabel)
                                ?: "Chưa có thông tin tình huống")
                            SosLabel("Gửi lúc: ${sosTime(item.createdAt)}")
                            SosLabel("Backend nhận vị trí: ${sosTime(item.locationReceivedAt)}")
                            item.note?.takeIf { it.isNotBlank() }?.let { SosLabel(it) }
                            SosLabel("Mở chi tiết", accent = true)
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun RescueSosDetailScreen(id: String, store: RescueSosStore,
    rescueLocation: RescueMapLocationController?, distanceRepository: RescueRouteDistanceRepository,
    onBack: () -> Unit, onOverview: () -> Unit, onMap: () -> Unit) {
    val state by store.state.collectAsStateWithLifecycle()
    var confirm by rememberSaveable(id) { mutableStateOf(false) }
    val resource = if (state.detailId == id) state.detail else SosResource<RescueSos>()
    val item = resource.data
    RescueSosRefresh(store, detailId = id)
    LaunchedEffect(state.accessError, item?.state) {
        if (state.accessError != null || item?.state != "active") confirm = false
    }
    SosFrame("Chi tiết SOS", onOverview, onMap) {
        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onBack) { Text("Danh sách SOS") }
                OutlinedButton(onClick = { store.openDetail(id) }, enabled = !resource.loading) { Text("Tải lại") }
            }
            SosLabel("Mã SOS: $id", bold = true)
            if (resource.loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            state.accessError?.let { SosLabel(it); SosLabel("Quay về Tổng quan để đăng nhập lại.") }
            resource.error?.let { SosLabel(it) }
            if (resource.error != null && item != null) SosLabel("Đang giữ dữ liệu lần tải trước; hãy tải lại để xác nhận trạng thái.")
            if (state.accessError == null && item != null) {
                SosLabel(when (item.state) { "active" -> "Đang chờ cứu"; "rescued" -> "Đã cứu"; else -> "Bản ghi lịch sử khác" }, bold = true, accent = true)
                SosLabel("Người gửi (ID): ${item.residentId ?: "Chưa có thông tin"}")
                SosLabel("Số người: ${item.numberOfPeople?.toString() ?: "Chưa có thông tin"}")
                SosLabel("Tình huống: " + (item.situations.takeIf { it.isNotEmpty() }?.joinToString(" • ", transform = ::situationLabel) ?: "Chưa có thông tin"))
                SosLabel("Mức nước: ${waterLabel(item.waterLevel)}")
                SosLabel("Ghi chú: ${item.note?.takeIf { it.isNotBlank() } ?: "Không có"}")
                SosLabel("Gửi lúc: ${sosTime(item.createdAt)}")
                SosLabel("Vị trí ban đầu: ${pointLabel(item.initialLocation)}")
                SosLabel(if (item.state == "rescued") "Vị trí cuối đã lưu: ${pointLabel(item.location)}"
                    else "Vị trí mới nhất Backend đã nhận: ${pointLabel(item.location)}")
                SosLabel("Thiết bị lấy vị trí: ${sosTime(item.locationCapturedAt)}")
                SosLabel("Backend nhận vị trí: ${sosTime(item.locationReceivedAt)}")
                SosLabel("Khi mất mạng, đây có thể là vị trí cũ; ứng dụng không biết vị trí chưa gửi được lên máy chủ.")
                RescueRouteDistanceSection(id, item.location, rescueLocation, distanceRepository)
                item.location?.takeIf { it.isValid() }?.let { SosLocationPreview(it, item.state == "rescued") }
                if (item.state == "rescued") {
                    SosLabel("Người xác nhận (ID): ${item.completedBy ?: "Chưa có thông tin"}")
                    SosLabel("Hoàn tất lúc: ${sosTime(item.completedAt)}")
                }
                if (item.state == "active") {
                    Button(onClick = { confirm = true }, enabled = state.canComplete && resource.loadedAt != null,
                        modifier = Modifier.fillMaxWidth()) {
                        Text(if (state.completingId == id) "Đang xác nhận…" else "Xác nhận đã cứu")
                    }
                    SosLabel("Chỉ xác nhận sau khi đã thực sự cứu/hỗ trợ người dân.")
                }
                state.actionMessage?.let { SosLabel(it, accent = true) }
                SosLabel("Lịch sử xử lý", bold = true)
                if (state.history.loading) SosLabel("Đang tải lịch sử…")
                state.history.error?.let { SosLabel("Chưa tải được lịch sử: $it") }
                state.history.data?.forEach { event ->
                    Surface(color = SosPanel, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            SosLabel("${statusLabel(event.oldStatus)} → ${statusLabel(event.newStatus)}")
                            SosLabel("Người thực hiện (ID): ${event.changedBy ?: "Chưa có thông tin"}")
                            SosLabel(sosTime(event.changedAt))
                            event.note?.let { SosLabel(it) }
                        }
                    }
                }
                if (state.history.data?.isEmpty() == true && state.history.error == null) SosLabel("Chưa có sự kiện lịch sử.")
            }
            Spacer(Modifier.height(12.dp))
        }
    }
    if (confirm && item?.state == "active" && state.accessError == null) {
        AlertDialog(onDismissRequest = { confirm = false }, containerColor = SosPanel,
            titleContentColor = SosText, textContentColor = SosText, title = { Text("Xác nhận đã cứu?") },
            text = { Text("Bạn xác nhận đã cứu/hỗ trợ SOS $id? Yêu cầu sẽ rời bản đồ đang xử lý và được giữ trong lịch sử.") },
            confirmButton = { TextButton(onClick = { confirm = false; store.complete(id) }, enabled = state.canComplete) { Text("Xác nhận đã cứu") } },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Quay lại") } })
    }
}


@Composable
private fun SosLocationPreview(point: SosPoint, rescued: Boolean) {
    val context = LocalContext.current
    val target = LatLng(point.latitude!!, point.longitude!!)

    val configured = remember(context) {
        runCatching {
            val info = context.packageManager.getApplicationInfo(
                context.packageName,
                PackageManager.GET_META_DATA
            )
            info.metaData
                ?.getString("com.google.android.geo.API_KEY")
                ?.let { it.isNotBlank() && !it.contains("YOUR_") } == true
        }.getOrDefault(false)
    }

    if (configured) {
        val camera = rememberCameraPositionState {
            position = CameraPosition.fromLatLngZoom(target, 15f)
        }

        var mapLoaded by remember {
            mutableStateOf(false)
        }

        LaunchedEffect(target, mapLoaded) {
            if (mapLoaded) {
                camera.position =
                    CameraPosition.fromLatLngZoom(target, 15f)
            }
        }

        GoogleMap(
            modifier = Modifier
                .fillMaxWidth()
                .height(210.dp),
            cameraPositionState = camera,
            onMapLoaded = { mapLoaded = true },
            properties = MapProperties(
                isMyLocationEnabled = false
            ),
            uiSettings = MapUiSettings(
                myLocationButtonEnabled = false,
                mapToolbarEnabled = false
            )
        ) {
            Marker(
                state = rememberUpdatedMarkerState(
                    position = target
                ),
                title = if (rescued)
                    "Vị trí cuối đã lưu"
                else
                    "Vị trí SOS mới nhất",
                icon = BitmapDescriptorFactory.defaultMarker(
                    BitmapDescriptorFactory.HUE_ORANGE
                )
            )
        }
    }

    OutlinedButton(
        onClick = {
            val uri = Uri.parse(
                "https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}"
            )
            try {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, uri)
                )
            } catch (_: Exception) {
                Toast.makeText(
                    context,
                    "Không mở được bản đồ chỉ đường.",
                    Toast.LENGTH_SHORT
                ).show()
            }
        },
        modifier = Modifier.fillMaxWidth()
    ) {
        Text("Tra cứu chỉ đường trên Google Maps")
    }

    SosLabel(
        "Chỉ đường tham khảo; hệ thống chưa xác minh tuyến tránh ngập."
    )
}

@Composable
private fun SosFrame(title: String, onOverview: () -> Unit, onMap: () -> Unit,
    content: @Composable ColumnScope.() -> Unit) {
    MaterialTheme(colorScheme = darkColorScheme(primary = SosAccent, onPrimary = SosBg,
        surface = SosPanel, onSurface = SosText, background = SosBg, onBackground = SosText)) {
    Surface(color = SosBg, contentColor = SosText, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            Column(Modifier.weight(1f).padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SosLabel(title, bold = true, accent = true); content()
            }
            RescueBottomBar(selectedTab = RescueMainTab.SOS, onOverview = onOverview, onMap = onMap)
        }
    }
    }
}
@Composable
private fun SosLabel(text: String, bold: Boolean = false, accent: Boolean = false) {
    Text(text, fontFamily = SosFont, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, color = if (accent) SosAccent else SosText)
}
internal fun sosTime(value: String?): String = value?.let {
    runCatching { DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss", Locale.forLanguageTag("vi-VN"))
        .withZone(ZoneId.systemDefault()).format(Instant.parse(it)) }.getOrDefault("Chưa có thời gian hợp lệ")
} ?: "Chưa có thông tin"
private fun pointLabel(point: SosPoint?) = point?.takeIf { it.isValid() }?.let {
    String.format(Locale.ROOT, "%.6f, %.6f", it.latitude, it.longitude)
} ?: "Chưa có tọa độ hợp lệ"
private fun situationLabel(value: String) = when (value) {
    "trapped" -> "Mắc kẹt"; "evacuation" -> "Cần sơ tán"; "injured" -> "Có người bị thương"
    "vulnerable" -> "Người già/trẻ nhỏ cần hỗ trợ"; "other" -> "Khác"; else -> value
}
private fun waterLabel(value: String?) = when (value) {
    "below_knee" -> "Dưới đầu gối"; "waist" -> "Đến thắt lưng"; "chest" -> "Đến ngực"
    "above_two_meters" -> "Trên 2 m"; null -> "Chưa có thông tin"; else -> value
}
private fun statusLabel(value: String?) = when (value) {
    null -> "Tạo yêu cầu"; "submitted" -> "Đã gửi"; "received" -> "Đã tiếp nhận (dữ liệu cũ)"
    "in_progress" -> "Đang cứu hộ (dữ liệu cũ)"; "assisted" -> "Đã cứu"; "cancelled" -> "Đã hủy (dữ liệu cũ)"; else -> value
}
