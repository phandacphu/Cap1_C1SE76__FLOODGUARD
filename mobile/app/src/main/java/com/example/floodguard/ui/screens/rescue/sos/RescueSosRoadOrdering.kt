package com.example.floodguard.ui.screens.rescue.sos

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import android.os.SystemClock
import com.example.floodguard.data.remote.dto.rescue.sos.SosPoint
import com.example.floodguard.ui.screens.rescue.RescueMapLocationController
import kotlinx.coroutines.CancellationException
import kotlin.math.roundToInt

/** Distances are road distances from ORS Matrix, never straight-line estimates. */
internal data class RescueSosRoadOrdering(
    val items: List<RescueSos>,
    val distances: Map<String, Int?>? = null,
    val message: String = "",
    val needsGps: Boolean = false,
    val canRetry: Boolean = false,
    val onRetry: () -> Unit = {}
)

private data class RoadSortFetch(
    val key: String? = null,
    val pending: Boolean = false,
    val distances: Map<String, Int?>? = null,
    val error: String? = null,
    val completedElapsedMs: Long = 0L
)

@Composable
internal fun rememberRescueSosRoadOrdering(
    items: List<RescueSos>,
    filter: SosFilter,
    location: RescueMapLocationController?,
    repository: RescueRouteDistanceRepository?
): RescueSosRoadOrdering {
    if (filter != SosFilter.ACTIVE) {
        return RescueSosRoadOrdering(items = items)
    }
    val fix = location?.state?.fix
    val gpsKey = fix?.let { "${(it.latitude * 1000).roundToInt()}:${(it.longitude * 1000).roundToInt()}" }
    val listKey = items.joinToString(separator = "|") { row ->
        "${row.id}:${row.location?.latitude}:${row.location?.longitude}"
    }
    val key = if (fix != null && repository != null && items.isNotEmpty()) "$gpsKey|$listKey" else null
    var retry by remember(repository) { mutableIntStateOf(0) }
    var fetch by remember(repository) { mutableStateOf(RoadSortFetch()) }

    // A 30-second list refresh with unchanged SOS coordinates does NOT trigger another ORS call.
    // Significant foreground GPS changes or an explicit retry may update the ordering.
    LaunchedEffect(key, retry, repository, filter) {
        if (key == null || fix == null || repository == null) return@LaunchedEffect
        fetch = RoadSortFetch(key = key, pending = true)
        try {
            val distances = repository.estimateListRoadDistances(
                SosPoint(fix.latitude, fix.longitude),
                items.map { it.id },
                items.associate { it.id to it.location }
            )
            fetch = RoadSortFetch(
                key = key, distances = distances,
                completedElapsedMs = SystemClock.elapsedRealtime()
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            fetch = RoadSortFetch(key = key, error = error.message ?: "Không tính được đường ô tô.")
        }
    }

    if (items.isEmpty()) return RescueSosRoadOrdering(items = items)
    if (fix == null || repository == null) {
        // Display a previously successful sort ONLY for the same SOS coordinates and
        // session GPS fix; never call Matrix with a stale location.
        val last = location?.state?.lastKnownFix
        val staleGpsKey = last?.let { "${(it.latitude * 1000).roundToInt()}:${(it.longitude * 1000).roundToInt()}" }
        val staleKey = if (last != null) "$staleGpsKey|$listKey" else null
        val stale = fetch.takeIf {
            staleKey != null && it.key == staleKey && it.distances != null &&
                SystemClock.elapsedRealtime() - it.completedElapsedMs <= 120_000L
        }?.distances
        if (stale != null) {
            return RescueSosRoadOrdering(
                items = items.sortedWith(compareBy<RescueSos> { stale[it.id] ?: Int.MAX_VALUE }),
                distances = stale,
                message = "Mất kết nối GPS · khoảng cách theo vị trí lần cuối, chưa cập nhật.",
                needsGps = true
            )
        }
        val status = if (last != null) "Mất kết nối GPS · đã giữ vị trí cuối; chờ cập nhật để tính đường."
            else if (location?.state?.isLoading == true) "Đang lấy GPS Rescue để xếp SOS gần → xa…"
            else "Chưa có GPS Rescue: danh sách chưa được xếp gần → xa."
        return RescueSosRoadOrdering(items = items, message = status, needsGps = true)
    }
    val active = fetch.takeIf { it.key == key }
    val distances = active?.distances
    if (distances != null) {
        // Kotlin's sortedWith is stable: equal/unknown road distances retain server order.
        val ordered = items.sortedWith(compareBy<RescueSos> { distances[it.id] ?: Int.MAX_VALUE })
        // Success is evident from the per-SOS km figures. Avoid a 3-line status banner.
        return RescueSosRoadOrdering(items = ordered, distances = distances)
    }
    if (active?.error != null) {
        return RescueSosRoadOrdering(items = items, message =
            "Chưa xếp gần → xa: ${active.error} Danh sách tạm theo thứ tự Backend.",
            canRetry = true, onRetry = { retry++ })
    }
    return RescueSosRoadOrdering(items = items,
        message = "Đang tính quãng đường ô tô để sắp xếp SOS gần → xa…")
}
