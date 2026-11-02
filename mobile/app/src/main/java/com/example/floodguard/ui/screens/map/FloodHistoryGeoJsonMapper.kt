
package com.example.floodguard.ui.screens.map

import com.google.gson.JsonObject
import com.google.gson.JsonElement

internal fun parseHistoricalFloodPoints(
    geojson: JsonObject
): List<HistoricalFloodPoint> {

    val features = geojson.getAsJsonArray("features")
        ?: return emptyList()

    return features.mapNotNull { feature ->
        runCatching {
            val geometry = feature.asJsonObject
                .getAsJsonObject("geometry")
                ?: return@runCatching null

            if (geometry.get("type")?.asString != "Point") {
                return@runCatching null
            }

            val coordinates = geometry
                .getAsJsonArray("coordinates")
                ?: return@runCatching null

            if (coordinates.size() < 2) {
                return@runCatching null
            }

            // GeoJSON: [longitude, latitude]
            val longitude = coordinates[0].asDouble
            val latitude = coordinates[1].asDouble

            if (
                !latitude.isFinite() ||
                !longitude.isFinite() ||
                latitude !in -90.0..90.0 ||
                longitude !in -180.0..180.0
            ) {
                return@runCatching null
            }

            HistoricalFloodPoint(
                latitude = latitude,
                longitude = longitude
            )
        }.getOrNull()
    }
}


internal fun parseHistoricalFloodPolygonFeatures(
    geojson: JsonObject
): Result<List<List<HistoricalFloodPolygon>>> = runCatching {

    val features = geojson.getAsJsonArray("features")
        ?: error("GeoJSON thiếu features")

    features.mapIndexed { index, feature ->

        val geometry = feature.asJsonObject
            .getAsJsonObject("geometry")
            ?: error("Feature $index thiếu geometry")

        val coordinates = geometry.get("coordinates")
            ?: error("Feature $index thiếu coordinates")

        val polygons = when (
            geometry.get("type")?.asString
        ) {
            "Polygon" -> {
                listOf(
                    readHistoricalPolygon(coordinates)
                        ?: error("Polygon không hợp lệ")
                )
            }

            "MultiPolygon" -> {
                require(coordinates.isJsonArray)

                coordinates.asJsonArray.map { polygon ->
                    readHistoricalPolygon(polygon)
                        ?: error("MultiPolygon không hợp lệ")
                }
            }

            else -> error("Loại geometry không hỗ trợ")
        }

        require(polygons.isNotEmpty()) {
            "Feature $index không có polygon hợp lệ"
        }

        polygons
    }
}

private fun readHistoricalPolygon(
    element: JsonElement
): HistoricalFloodPolygon? {

    if (!element.isJsonArray) return null

    val rings = element.asJsonArray

    if (rings.size() == 0) return null

    val outer = readHistoricalRing(rings[0])
        ?: return null

    val holes = mutableListOf<List<HistoricalFloodPoint>>()

    for (index in 1 until rings.size()) {

        val hole = readHistoricalRing(rings[index])
            ?: return null

        holes.add(hole)
    }

    return HistoricalFloodPolygon(
        outer = outer,
        holes = holes
    )
}

private fun readHistoricalRing(
    element: JsonElement
): List<HistoricalFloodPoint>? {

    if (!element.isJsonArray) return null

    val points = mutableListOf<HistoricalFloodPoint>()

    for (coordinate in element.asJsonArray) {

        if (
            !coordinate.isJsonArray ||
            coordinate.asJsonArray.size() < 2
        ) {
            return null
        }

        val longitude = runCatching {
            coordinate.asJsonArray[0].asDouble
        }.getOrNull() ?: return null

        val latitude = runCatching {
            coordinate.asJsonArray[1].asDouble
        }.getOrNull() ?: return null

        if (
            !latitude.isFinite() ||
            !longitude.isFinite() ||
            latitude !in -90.0..90.0 ||
            longitude !in -180.0..180.0
        ) {
            return null
        }

        points.add(
            HistoricalFloodPoint(
                latitude = latitude,
                longitude = longitude
            )
        )
    }

    // GeoJSON thường lặp lại điểm đầu ở cuối vòng.
    val normalized = if (
        points.size >= 2 &&
        points.first() == points.last()
    ) {
        points.dropLast(1)
    } else {
        points
    }

    return normalized.takeIf {
        it.distinct().size >= 3
    }
}