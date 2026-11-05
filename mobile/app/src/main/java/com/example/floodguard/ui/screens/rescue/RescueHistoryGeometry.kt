package com.example.floodguard.ui.screens.rescue

import com.google.gson.JsonElement
import com.google.gson.JsonObject

internal data class RescueHistoryPolygon(
    val outer: List<RescueFloodVertex>,
    val holes: List<List<RescueFloodVertex>>
)

internal data class RescueHistoryGeometry(
    val points: List<RescueFloodVertex> = emptyList(),
    val polygons: List<RescueHistoryPolygon> = emptyList()
)

/** Reject malformed geometry rather than drawing a misleading boundary. */
internal fun parseRescueHistoryLayer(json: JsonObject, layer: String): RescueHistoryGeometry {
    require(json.get("type")?.asString == "FeatureCollection")
    val features = json.get("features")
    require(features != null && features.isJsonArray)
    val points = mutableListOf<RescueFloodVertex>()
    val polygons = mutableListOf<RescueHistoryPolygon>()
    features.asJsonArray.forEach { feature ->
        val geometry = feature.asJsonObject.getAsJsonObject("geometry")
            ?: error("Missing geometry")
        val coordinates = geometry.get("coordinates") ?: error("Missing coordinates")
        when (geometry.get("type")?.asString) {
            "Point" -> {
                require(layer == "points")
                points.add(readHistoryPoint(coordinates))
            }
            "Polygon" -> {
                require(layer != "points")
                polygons.add(readHistoryPolygon(coordinates))
            }
            "MultiPolygon" -> {
                require(layer != "points" && coordinates.isJsonArray && coordinates.asJsonArray.size() > 0)
                coordinates.asJsonArray.forEach { polygons.add(readHistoryPolygon(it)) }
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

private fun readHistoryPolygon(value: JsonElement): RescueHistoryPolygon {
    require(value.isJsonArray && value.asJsonArray.size() > 0)
    val rings = value.asJsonArray.map { ring ->
        require(ring.isJsonArray)
        val coords = ring.asJsonArray.map(::readHistoryPoint)
        val normalized = if (coords.size > 1 && coords.first() == coords.last()) coords.dropLast(1) else coords
        require(normalized.distinct().size >= 3)
        normalized
    }
    return RescueHistoryPolygon(rings.first(), rings.drop(1))
}
