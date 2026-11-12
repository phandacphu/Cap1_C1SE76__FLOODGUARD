package com.example.floodguard.ui.screens.rescue.sos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import android.os.SystemClock
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.floodguard.data.remote.dto.rescue.sos.RescueRouteDistanceApi
import com.example.floodguard.data.remote.dto.rescue.sos.RescueRouteDistanceRequest
import com.example.floodguard.data.remote.dto.rescue.sos.RescueRouteMatrixRequest
import com.example.floodguard.data.remote.dto.rescue.sos.SosPoint
import com.example.floodguard.ui.screens.rescue.RescueMapLocationController
import kotlinx.coroutines.CancellationException
import java.io.IOException
import java.util.Locale

/** Read-only route estimate; does not change SOS status or GPS updates. */
internal class RescueRouteDistanceRepository(private val api: RescueRouteDistanceApi) {
    private data class Entry(val meters: Int, val storedAt: Long)
    private val cache = LinkedHashMap<String, Entry>()
    private val ttlMillis = 120_000L

    private fun storeRoadDistance(entryKey: String, meters: Int) {
        cache[entryKey] = Entry(meters, SystemClock.elapsedRealtime())
        while (cache.size > 64) cache.remove(cache.keys.first())
    }

    private fun key(requestId: String, latitude: Double, longitude: Double, destination: SosPoint): String =
        "$requestId|$latitude|$longitude|${destination.latitude}|${destination.longitude}"

    // Only previously returned road-route values are cached. Never substitute air distance.
    fun cached(requestId: String, latitude: Double, longitude: Double, destination: SosPoint): Int? {
        val entryKey = key(requestId, latitude, longitude, destination)
        val entry = cache[entryKey] ?: return null
        if (SystemClock.elapsedRealtime() - entry.storedAt > ttlMillis) {
            cache.remove(entryKey)
            return null
        }
        return entry.meters
    }

    /** One ORS Matrix request per chunk; never make one Directions call per list row. */
    suspend fun estimateListRoadDistances(
        origin: SosPoint,
        requestIds: List<String>,
        visibleLocations: Map<String, SosPoint?>
    ): Map<String, Int?> {
        require(origin.isValid() && requestIds.size == requestIds.distinct().size)
        val result = LinkedHashMap<String, Int?>()
        // Stage entries until all chunks succeed; failed batches must not partly update the cache.
        val verifiedEntries = LinkedHashMap<String, Int>()
        for (chunk in requestIds.chunked(100)) {
            val response = api.estimateBatch(RescueRouteMatrixRequest(origin, chunk))
            if (!response.isSuccessful) {
                val explanation = when (response.code()) {
                    401, 403 -> "Phiên Rescue không hợp lệ hoặc không có quyền."
                    404 -> "Backend chưa hỗ trợ sắp xếp SOS theo đường bộ."
                    429, 503 -> "ORS đang giới hạn yêu cầu. Vui lòng thử lại sau."
                    else -> "Không lấy được khoảng cách danh sách (HTTP ${response.code()})."
                }
                throw IllegalStateException(explanation)
            }
            val data = response.body()?.takeIf { it.success == true }?.data
            val values = data?.results
            if (data?.provider != "openrouteservice" || data?.travelMode != "DRIVE" ||
                values == null || values.size != chunk.size) {
                throw IllegalStateException("Backend trả kết quả Matrix không hợp lệ.")
            }
            val page = LinkedHashMap<String, Int?>()
            for (row in values) {
                val id = row?.requestId
                val meters = row?.distanceMeters
                if (id == null || id !in chunk || page.containsKey(id) ||
                    (meters != null && meters < 0)) {
                    throw IllegalStateException("Backend trả kết quả Matrix không hợp lệ.")
                }
                // Never associate a road distance with a stale UI coordinate. The server
                // resolves SOS positions from Firestore; the UI list may be older.
                val authoritative = row?.destination?.takeIf { it.isValid() }
                val displayed = visibleLocations[id]?.takeIf { it.isValid() }
                val matchingLocation = authoritative != null && authoritative == displayed
                page[id] = meters.takeIf { matchingLocation }
                if (meters != null && displayed != null && matchingLocation) {
                    verifiedEntries[key(id, origin.latitude!!, origin.longitude!!, displayed)] = meters
                }
            }
            if (page.size != chunk.size) throw IllegalStateException("Backend thiếu SOS trong Matrix.")
            result.putAll(page)
        }
        verifiedEntries.forEach { (entryKey, meters) -> storeRoadDistance(entryKey, meters) }
        return result
    }

    suspend fun estimate(requestId: String, latitude: Double, longitude: Double, destination: SosPoint): Int {
        require(requestId.isNotBlank())
        cached(requestId, latitude, longitude, destination)?.let { return it }
        val response = api.estimate(
            RescueRouteDistanceRequest(requestId, SosPoint(latitude, longitude))
        )
        if (!response.isSuccessful) {
            // HTTP 404 may mean this endpoint has not been deployed yet, not a missing road route.
            val errorCode = runCatching {
                org.json.JSONObject(response.errorBody()?.string().orEmpty()).optString("code")
            }.getOrNull()
            throw RouteDistanceFailure(
                when (response.code()) {
                    401, 403 -> "Không có quyền lấy khoảng cách. Vui lòng kiểm tra phiên đăng nhập."
                    404 -> when (errorCode) {
                        "ROUTE_NOT_FOUND" -> "Chưa tìm thấy đường ô tô đến SOS."
                        "SOS_NOT_FOUND" -> "SOS không tồn tại trên Backend."
                        else -> "Backend chưa có API tính khoảng cách; cần chạy phiên bản Backend mới."
                    }
                    422 -> "SOS chưa có tọa độ hợp lệ để tính khoảng cách."
                    429 -> "Đã vượt giới hạn yêu cầu. Vui lòng thử lại sau."
                    503 -> "Dịch vụ tính quãng đường chưa sẵn sàng."
                    504 -> "Yêu cầu khoảng cách quá thời gian chờ."
                    else -> "Chưa lấy được quãng đường (HTTP ${response.code()})."
                }
            )
        }
        val envelope = response.body()
        val data = envelope?.data
        val meters = data?.distanceMeters
        if (envelope?.success != true || data?.requestId != requestId ||
            data?.provider != "openrouteservice" || data?.travelMode != "DRIVE" ||
            meters == null || meters < 0
        ) {
            throw RouteDistanceFailure("Backend trả về quãng đường không hợp lệ.")
        }
        if (data?.destination != destination) {
            throw RouteDistanceFailure("Vị trí SOS đã thay đổi. Vui lòng tải lại chi tiết.")
        }
        storeRoadDistance(key(requestId, latitude, longitude, destination), meters)
        return meters
    }
}

private class RouteDistanceFailure(message: String) : Exception(message)

private data class RouteDistanceState(
    val loading: Boolean = false,
    val meters: Int? = null,
    val error: String? = null
)

@Composable
internal fun RescueRouteDistanceSection(
    requestId: String,
    destination: SosPoint?,
    location: RescueMapLocationController?,
    repository: RescueRouteDistanceRepository
) {
    val fix = location?.state?.fix
    val staleFix = if (fix == null) location?.state?.lastKnownFix else null
    val validDestination = destination?.takeIf { it.isValid() }
    val cachedStaleMeters = if (staleFix != null && validDestination != null)
        repository.cached(requestId, staleFix.latitude, staleFix.longitude, validDestination)
    else null
    var retryKey by remember(requestId) { mutableIntStateOf(0) }
    val cachedMeters = if (fix != null && validDestination != null)
        repository.cached(requestId, fix.latitude, fix.longitude, validDestination) else null
    var result by remember(requestId, fix?.latitude, fix?.longitude,
        validDestination?.latitude, validDestination?.longitude, repository, retryKey) {
        mutableStateOf(RouteDistanceState(meters = cachedMeters))
    }
    // Not keyed by the SOS refresh timestamp: unchanged coordinates do not create extra provider calls.
    LaunchedEffect(requestId, fix?.latitude, fix?.longitude,
        validDestination?.latitude, validDestination?.longitude, repository, retryKey) {
        if (fix == null || validDestination == null) return@LaunchedEffect
        if (cachedMeters != null) {
            result = RouteDistanceState(meters = cachedMeters)
            return@LaunchedEffect
        }
        result = RouteDistanceState(loading = true)
        try {
            val meters = repository.estimate(requestId, fix.latitude, fix.longitude, validDestination)
            result = RouteDistanceState(meters = meters)
        } catch (e: CancellationException) {
            throw e
        } catch (e: RouteDistanceFailure) {
            result = RouteDistanceState(error = e.message)
        } catch (_: IOException) {
            result = RouteDistanceState(error = "Không kết nối được Backend để tính khoảng cách.")
        } catch (_: Exception) {
            result = RouteDistanceState(error = "Chưa tính được khoảng cách. Vui lòng thử lại.")
        }
    }

    Surface(color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text("Quãng đường dự kiến", color = MaterialTheme.colorScheme.onSurfaceVariant)
            when {
                validDestination == null || location == null -> Text("Chưa xác định")
                fix == null -> {
                    if (cachedStaleMeters != null) {
                        Text(
                            String.format(Locale.forLanguageTag("vi-VN"), "%.1f km", cachedStaleMeters / 1000.0),
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Text("Mất kết nối GPS · km theo vị trí lần cuối, chưa cập nhật.")
                    } else {
                        Text(if (location.state.isLoading) "Đang lấy GPS…" else "Chưa xác định")
                        if (staleFix != null) Text("Mất kết nối GPS · vị trí lần cuối đã được giữ.")
                    }
                    if (!location.state.isLoading) {
                        TextButton(onClick = location.locate) { Text("Lấy GPS") }
                    }
                }
                result.loading -> Text("Đang tính…")
                result.meters != null -> Text(
                    String.format(Locale.forLanguageTag("vi-VN"), "%.1f km", result.meters!! / 1000.0),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                else -> {
                    Text(result.error ?: "Chưa xác định")
                    TextButton(onClick = { retryKey++ }) { Text("Thử lại") }
                }
            }
            Text("Quãng đường ô tô chỉ tham khảo, không bảo đảm an toàn khi ngập.",
                style = MaterialTheme.typography.bodySmall)
        }
    }
}
