package com.example.floodguard.ui.screens.rescue

import com.google.gson.JsonElement
import com.google.gson.JsonObject

internal data class RescueHistoryPolygon(
    val outer: List<RescueFloodVertex>,
    val holes: List<List<RescueFloodVertex>>,
    val id: String? = null,
    val name: String? = null,
    val description: String? = null,
    val areaType: String? = null,
    val source: String? = null
)

internal data class RescueHistoryPoint(
    val position: RescueFloodVertex,
    val id: String?,
    val name: String?,
    val description: String?,
    val areaType: String? = null,
    val source: String? = null
)

internal data class RescueHistoryGeometry(
    val points: List<RescueHistoryPoint> = emptyList(),
    val polygons: List<RescueHistoryPolygon> = emptyList()
)

private fun JsonObject?.historyText(key: String): String? {
    val value = this?.get(key) ?: return null
    if (!value.isJsonPrimitive || !value.asJsonPrimitive.isString) return null
    return value.asString.trim().takeIf { it.isNotEmpty() }
}

/** Reject malformed geometry rather than drawing a misleading boundary. */
internal fun parseRescueHistoryLayer(json: JsonObject, layer: String): RescueHistoryGeometry {
    require(json.get("type")?.asString == "FeatureCollection")
    val features = json.get("features")
    require(features != null && features.isJsonArray)
    val points = mutableListOf<RescueHistoryPoint>()
    val polygons = mutableListOf<RescueHistoryPolygon>()
    features.asJsonArray.forEach { feature ->
        val geometry = feature.asJsonObject.getAsJsonObject("geometry")
            ?: error("Missing geometry")
        val coordinates = geometry.get("coordinates") ?: error("Missing coordinates")
        val properties = feature.asJsonObject.get("properties")
            ?.takeIf { it.isJsonObject }?.asJsonObject
        when (geometry.get("type")?.asString) {
            "Point" -> {
                require(layer == "points")
                points.add(RescueHistoryPoint(
                    position = readHistoryPoint(coordinates),
                    id = properties.historyText("id"),
                    name = properties.historyText("name"),
                    description = properties.historyText("description"),
                    areaType = properties.historyText("areaType"),
                    source = properties.historyText("source")
                ))
            }
            "Polygon" -> {
                require(layer != "points")
                polygons.add(readHistoryPolygon(coordinates, properties))
            }
            "MultiPolygon" -> {
                require(layer != "points" && coordinates.isJsonArray && coordinates.asJsonArray.size() > 0)
                coordinates.asJsonArray.forEach { polygons.add(readHistoryPolygon(it, properties)) }
            }
            else -> error("Unsupported geometry")
        }
    }
    return RescueHistoryGeometry(points, polygons)
}

private fun readHistoryPoint(value: JsonElement): RescueFloodVertex {
    require(value.isJsonArray && value.asJsonArray.size() >= 2)
    val coords = value.asJsonArray
    require(coords[0].isJsonPrimitive && coords[0].asJsonPrimitive.isNumber)
    require(coords[1].isJsonPrimitive && coords[1].asJsonPrimitive.isNumber)
    val longitude = coords[0].asDouble
    val latitude = coords[1].asDouble
    require(latitude.isFinite() && longitude.isFinite())
    require(latitude in -90.0..90.0 && longitude in -180.0..180.0)
    return RescueFloodVertex(latitude, longitude)
}

private fun readHistoryPolygon(value: JsonElement, properties: JsonObject?): RescueHistoryPolygon {
    require(value.isJsonArray && value.asJsonArray.size() > 0)
    val rings = value.asJsonArray.map { ring ->
        require(ring.isJsonArray)
        val coords = ring.asJsonArray.map(::readHistoryPoint)
        val normalized = if (coords.size > 1 && coords.first() == coords.last()) coords.dropLast(1) else coords
        require(normalized.distinct().size >= 3)
        normalized
    }
    return RescueHistoryPolygon(
        outer = rings.first(), holes = rings.drop(1),
        id = properties.historyText("id"),
        name = properties.historyText("name"),
        description = properties.historyText("description"),
        areaType = properties.historyText("areaType"),
        source = properties.historyText("source")
    )
}
