
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

            readHistoricalPoint(
                feature = feature.asJsonObject,
                latitude = latitude,
                longitude = longitude
            )
        }.getOrNull()
    }
}


internal data class HistoricalPointsParseResult(
    val points: List<HistoricalFloodPoint>,
    val invalidFeatureCount: Int
)

internal fun parseHistoricalFloodPointsValidated(
    geojson: JsonObject
): Result<HistoricalPointsParseResult> = runCatching {

    val type = geojson.get("type")

    require(
        type != null &&
                type.isJsonPrimitive &&
                type.asString == "FeatureCollection"
    ) {
        "GeoJSON không phải FeatureCollection"
    }

    val featuresElement = geojson.get("features")

    require(
        featuresElement != null &&
                featuresElement.isJsonArray
    ) {
        "GeoJSON thiếu mảng features hợp lệ"
    }

    val features = featuresElement.asJsonArray

    val validPoints = mutableListOf<HistoricalFloodPoint>()
    var invalidCount = 0

    for (feature in features) {

        val point = runCatching {

            if (!feature.isJsonObject) {
                return@runCatching null
            }

            val geometryElement =
                feature.asJsonObject.get("geometry")

            if (
                geometryElement == null ||
                !geometryElement.isJsonObject
            ) {
                return@runCatching null
            }

            val geometry = geometryElement.asJsonObject

            if (geometry.get("type")?.asString != "Point") {
                return@runCatching null
            }

            val coordinatesElement =
                geometry.get("coordinates")

            if (
                coordinatesElement == null ||
                !coordinatesElement.isJsonArray
            ) {
                return@runCatching null
            }

            val coordinates =
                coordinatesElement.asJsonArray

            if (coordinates.size() < 2) {
                return@runCatching null
            }

            val longitudeElement = coordinates[0]
            val latitudeElement = coordinates[1]

            if (
                !longitudeElement.isJsonPrimitive ||
                !latitudeElement.isJsonPrimitive ||
                !longitudeElement.asJsonPrimitive.isNumber ||
                !latitudeElement.asJsonPrimitive.isNumber
            ) {
                return@runCatching null
            }

            // GeoJSON: [longitude, latitude]
            val longitude = longitudeElement.asDouble
            val latitude = latitudeElement.asDouble

            if (
                !latitude.isFinite() ||
                !longitude.isFinite() ||
                latitude !in -90.0..90.0 ||
                longitude !in -180.0..180.0
            ) {
                return@runCatching null
            }

            readHistoricalPoint(
                feature = feature.asJsonObject,
                latitude = latitude,
                longitude = longitude
            )

        }.getOrNull()

        if (point == null) {
            invalidCount++
        } else {
            validPoints.add(point)
        }
    }

    if (
        features.size() > 0 &&
        validPoints.isEmpty()
    ) {
        error(
            "Tất cả ${features.size()} feature điểm " +
                    "đều không hợp lệ"
        )
    }

    HistoricalPointsParseResult(
        points = validPoints,
        invalidFeatureCount = invalidCount
    )
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

private fun readHistoricalPoint(
    feature: JsonObject,
    latitude: Double,
    longitude: Double
): HistoricalFloodPoint {
    val properties = feature.get("properties")
        ?.takeIf { it.isJsonObject }
        ?.asJsonObject

    return HistoricalFloodPoint(
        latitude = latitude,
        longitude = longitude,
        id = historicalIdentifier(properties?.get("id"))
            ?: historicalIdentifier(feature.get("id")),
        name = historicalText(properties?.get("name")),
        sourceUrl = historicalText(properties?.get("source_url")),
        locationRefUrl = historicalText(
            properties?.get("location_ref_url")
        ),
        dataPeriod = historicalText(properties?.get("data_period")),
        coordinateStatus = historicalText(
            properties?.get("coordinate_status")
        ),
        layerType = historicalText(properties?.get("layer_type")),
        displayOnly = historicalBoolean(
            properties?.get("display_only")
        ),
        verifiedFloodPolygon = historicalBoolean(
            properties?.get("verified_flood_polygon")
        ),
        currentFloodAlert = historicalBoolean(
            properties?.get("current_flood_alert")
        )
    )
}

private fun historicalIdentifier(
    element: JsonElement?
): String? {
    if (element == null || !element.isJsonPrimitive) {
        return null
    }

    val primitive = element.asJsonPrimitive

    if (!primitive.isString && !primitive.isNumber) {
        return null
    }

    return primitive.asString.takeIf { it.isNotBlank() }
}

private fun historicalText(
    element: JsonElement?
): String? {
    if (
        element == null ||
        !element.isJsonPrimitive ||
        !element.asJsonPrimitive.isString
    ) {
        return null
    }

    return element.asString.trim().takeIf { it.isNotEmpty() }
}

private fun historicalBoolean(
    element: JsonElement?
): Boolean? {
    if (
        element == null ||
        !element.isJsonPrimitive ||
        !element.asJsonPrimitive.isBoolean
    ) {
        return null
    }

    return element.asBoolean
}