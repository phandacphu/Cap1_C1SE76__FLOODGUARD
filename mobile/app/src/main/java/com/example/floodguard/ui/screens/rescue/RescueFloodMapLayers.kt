package com.example.floodguard.ui.screens.rescue

import com.example.floodguard.data.model.FloodAlertDto
import com.example.floodguard.data.model.FloodAreaDto
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs

internal enum class RescueFloodSeverity(val label: String, val priority: Int) {
    LOW("Thấp", 1), MEDIUM("Trung bình", 2), HIGH("Cao", 3),
    CRITICAL("Rất cao", 4), UNKNOWN("Chưa xác định", 0);

    companion object {
        fun from(value: String?): RescueFloodSeverity = when (value?.trim()?.lowercase(Locale.ROOT)) {
            "low" -> LOW
            "medium" -> MEDIUM
            "high" -> HIGH
            "critical" -> CRITICAL
            else -> UNKNOWN
        }
    }
}

internal data class RescueFloodVertex(val latitude: Double, val longitude: Double)

internal data class RescueFloodMapArea(
    val id: String,
    val name: String,
    val description: String,
    val source: String,
    val severity: RescueFloodSeverity,
    val status: String,
    val vertices: List<RescueFloodVertex>
) {
    val isActive: Boolean get() = status == "active"
    val statusLabel: String get() = when (status) {
        "active" -> "Đang hoạt động"
        "inactive" -> "Đã ngừng hoạt động"
        else -> "Chưa xác định trạng thái"
    }
}

internal data class RescueFloodMapLayers(
    val areas: List<RescueFloodMapArea>,
    val skippedCount: Int
)

/** Validate before LatLng construction: the SDK normalizes out-of-range values.
 * Never silently delete a bad vertex and draw a different boundary.
 */
internal fun buildRescueFloodMapLayers(items: List<FloodAreaDto?>): RescueFloodMapLayers {
    val ids = mutableSetOf<String>()
    val areas = items.mapNotNull { area ->
        area ?: return@mapNotNull null
        val id = area.id?.trim().orEmpty()
        if (id.isEmpty() || id in ids) return@mapNotNull null
        val geometry = area.geometry ?: return@mapNotNull null
        if (!geometry.type.equals("polygon", ignoreCase = true)) return@mapNotNull null
        val points = geometry.points ?: return@mapNotNull null
        val vertices = mutableListOf<RescueFloodVertex>()
        for (point in points) {
            point ?: return@mapNotNull null
            if (!point.latitude.isFinite() || !point.longitude.isFinite() ||
                point.latitude !in -90.0..90.0 || point.longitude !in -180.0..180.0
            ) return@mapNotNull null
            val vertex = RescueFloodVertex(point.latitude, point.longitude)
            if (vertices.lastOrNull() != vertex) vertices += vertex
        }
        if (vertices.size > 1 && vertices.first() == vertices.last()) vertices.removeAt(vertices.lastIndex)
        if (vertices.distinct().size < 3) return@mapNotNull null
        val first = vertices.first()
        val second = vertices.first { it != first }
        val hasArea = vertices.any { third ->
            abs((second.longitude - first.longitude) * (third.latitude - first.latitude) -
                (second.latitude - first.latitude) * (third.longitude - first.longitude)) > 1e-12
        }
        if (!hasArea) return@mapNotNull null
        ids += id
        RescueFloodMapArea(
            id = id,
            name = area.name?.trim().orEmpty().ifEmpty { "Vùng chưa có tên" },
            description = area.description?.trim().orEmpty().ifEmpty { "Chưa có mô tả." },
            source = area.source?.trim().orEmpty().ifEmpty { "Chưa có thông tin nguồn." },
            severity = RescueFloodSeverity.from(area.severity),
            status = area.status?.trim()?.lowercase(Locale.ROOT).orEmpty(),
            vertices = vertices.toList()
        )
    }.sortedWith(compareByDescending<RescueFloodMapArea> { it.isActive }
        .thenByDescending { it.severity.priority }.thenBy { it.name })
    return RescueFloodMapLayers(areas, items.size - areas.size)
}

/** Only associate an alert with its referenced area; never infer from proximity. */
internal fun rescueWarningsForArea(
    warnings: List<FloodAlertDto>,
    areaId: String
): List<FloodAlertDto> = warnings.filter {
    it.areaId?.trim() == areaId && it.status.equals("active", ignoreCase = true)
}.sortedByDescending { RescueFloodSeverity.from(it.severity).priority }

internal fun formatRescueWarningTime(value: String?, zone: ZoneId = ZoneId.systemDefault()): String {
    if (value.isNullOrBlank()) return "Chưa cung cấp"
    return try {
        DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm XXX", Locale.forLanguageTag("vi-VN"))
            .withZone(zone).format(Instant.parse(value))
    } catch (_: java.time.DateTimeException) {
        "Thời gian không hợp lệ"
    }
}
