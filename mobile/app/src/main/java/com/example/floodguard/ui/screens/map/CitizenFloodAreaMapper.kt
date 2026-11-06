package com.example.floodguard.ui.screens.map

import com.example.floodguard.data.model.FloodAreaDto
import com.example.floodguard.data.model.FloodGeometryDto
import com.example.floodguard.data.model.FloodPointDto

enum class CitizenAreaType(val label: String) {
    FLOOD("Vùng ngập"),
    LOW_LYING("Vùng trũng")
}

data class CitizenAreaVertex(
    val latitude: Double,
    val longitude: Double
)

data class CitizenMapArea(
    val id: String,
    val name: String?,
    val description: String?,
    val source: String?,
    val areaType: CitizenAreaType,
    val vertices: List<CitizenAreaVertex>
)

internal data class CitizenAreaMappingResult(
    val areas: List<CitizenMapArea>,
    val unsupportedTypeCount: Int,
    val invalidRecordCount: Int
)

internal fun mapCitizenFloodAreas(
    items: List<FloodAreaDto?>
): CitizenAreaMappingResult {
    val duplicateIds = items
        .mapNotNull { citizenAreaId(it?.id) }
        .groupingBy { it }
        .eachCount()
        .filterValues { it > 1 }
        .keys

    val areas = mutableListOf<CitizenMapArea>()
    var unsupportedTypeCount = 0
    var invalidRecordCount = 0

    for (item in items) {
        if (item == null) {
            invalidRecordCount++
            continue
        }

        val id = citizenAreaId(item.id)

        if (id == null || id in duplicateIds) {
            invalidRecordCount++
            continue
        }

        val areaType = when (item.areaType) {
            "flood" -> CitizenAreaType.FLOOD
            "low_lying" -> CitizenAreaType.LOW_LYING
            else -> null
        }

        if (areaType == null) {
            unsupportedTypeCount++
            continue
        }

        val vertices = citizenAreaVertices(item.geometry)

        if (vertices == null) {
            invalidRecordCount++
            continue
        }

        areas += CitizenMapArea(
            id = id,
            name = citizenAreaText(item.name),
            description = citizenAreaText(item.description),
            source = citizenAreaText(item.source),
            areaType = areaType,
            vertices = vertices
        )
    }

    return CitizenAreaMappingResult(
        areas = areas.toList(),
        unsupportedTypeCount = unsupportedTypeCount,
        invalidRecordCount = invalidRecordCount
    )
}

private fun citizenAreaId(value: String?): String? =
    value?.takeIf { it.isNotBlank() }

private fun citizenAreaText(value: String?): String? =
    value?.trim()?.takeIf { it.isNotEmpty() }

private fun citizenAreaVertices(
    geometry: FloodGeometryDto?
): List<CitizenAreaVertex>? {
    if (
        geometry == null ||
        !geometry.type.equals("polygon", ignoreCase = true)
    ) {
        return null
    }

    val points: List<FloodPointDto?>? = geometry.points

    if (points == null) return null

    val vertices = mutableListOf<CitizenAreaVertex>()

    for (point in points) {
        if (
            point == null ||
            !point.latitude.isFinite() ||
            !point.longitude.isFinite() ||
            point.latitude !in -90.0..90.0 ||
            point.longitude !in -180.0..180.0
        ) {
            return null
        }

        vertices += CitizenAreaVertex(
            latitude = point.latitude,
            longitude = point.longitude
        )
    }

    if (vertices.distinct().size < 3) return null

    // Giữ nguyên thứ tự và toàn bộ đỉnh hợp lệ.
    return vertices.toList()
}