package com.example.floodguard.ui.screens.map

import com.google.gson.JsonElement
import com.google.gson.JsonObject

/** Admin-drawn historical geometry is a reference layer, never a current alert. */
data class HistoricalDrawnArea(
    val id: String,
    val name: String?,
    val description: String?,
    val source: String?,
    val areaType: CitizenAreaType,
    val polygon: HistoricalFloodPolygon
) {
    val currentFloodAlert: Boolean get() = false
}

internal fun parseHistoricalDrawnAreas(
    geojson: JsonObject
): Result<List<HistoricalDrawnArea>> = runCatching {
    require(geojson.get("type")?.asString == "FeatureCollection") {
        "Lớp HIST không phải FeatureCollection"
    }
    val features = geojson.get("features")
    require(features != null && features.isJsonArray) {
        "Lớp HIST thiếu features"
    }

    val areas = features.asJsonArray.map { element ->
        require(element.isJsonObject) { "Feature HIST không hợp lệ" }
        val feature = element.asJsonObject
        require(feature.get("type")?.asString == "Feature") {
            "Bản ghi HIST không phải Feature"
        }
        val properties = feature.getAsJsonObject("properties")
            ?: error("Feature HIST thiếu properties")
        val id = areaText(properties.get("id"))
            ?: error("Feature HIST thiếu ID")
        val areaType = when (areaText(properties.get("areaType"))) {
            "flood" -> CitizenAreaType.FLOOD
            "low_lying" -> CitizenAreaType.LOW_LYING
            else -> error("Loại vùng HIST không hợp lệ")
        }
        val geometry = feature.getAsJsonObject("geometry")
            ?: error("Feature HIST thiếu geometry")
        require(geometry.get("type")?.asString == "Polygon") {
            "Vùng HIST phải có geometry Polygon"
        }
        validateAreaRings(geometry.get("coordinates"))

        // Reuse the established Polygon/hole mapper after strict GeoJSON validation.
        val singleFeature = JsonObject().apply {
            addProperty("type", "FeatureCollection")
            add("features", com.google.gson.JsonArray().apply { add(feature) })
        }
        val polygon = parseHistoricalFloodPolygonFeatures(singleFeature)
            .getOrThrow().single().single()
        HistoricalDrawnArea(
            id = id,
            name = areaText(properties.get("name")),
            description = areaText(properties.get("description")),
            source = areaText(properties.get("source")),
            areaType = areaType,
            polygon = polygon
        )
    }
    require(areas.map { it.id }.distinct().size == areas.size) {
        "Lớp HIST có ID trùng nhau"
    }
    areas
}

private fun validateAreaRings(element: JsonElement?) {
    require(element != null && element.isJsonArray && element.asJsonArray.size() > 0) {
        "Vùng HIST thiếu vòng tọa độ"
    }
    element.asJsonArray.forEach { ringElement ->
        require(ringElement.isJsonArray) { "Vòng HIST không hợp lệ" }
        val ring = ringElement.asJsonArray
        require(ring.size() >= 4) { "Vòng HIST phải có ít nhất 4 tọa độ" }
        ring.forEach { position ->
            require(position.isJsonArray && position.asJsonArray.size() in 2..3) {
                "Tọa độ HIST không hợp lệ"
            }
            val numbers = position.asJsonArray.map { coordinate ->
                require(coordinate.isJsonPrimitive && coordinate.asJsonPrimitive.isNumber) {
                    "Tọa độ HIST phải là số"
                }
                coordinate.asDouble.also { require(it.isFinite()) }
            }
            // GeoJSON positions are [longitude, latitude, optional altitude].
            require(numbers[0] in -180.0..180.0 && numbers[1] in -90.0..90.0) {
                "Tọa độ HIST ngoài giới hạn"
            }
        }
        val first = ring[0].asJsonArray
        val last = ring[ring.size() - 1].asJsonArray
        require(first.size() == last.size() &&
            (0 until first.size()).all { first[it].asDouble == last[it].asDouble }) {
            "Vòng HIST phải khép kín"
        }
    }
}

private fun areaText(value: JsonElement?): String? =
    value?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }
        ?.asString?.trim()?.takeIf { it.isNotEmpty() }
