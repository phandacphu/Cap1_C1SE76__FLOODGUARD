package com.example.floodguard.data.model

import com.google.gson.JsonElement

data class RescueFloodWarningsV2ListResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val data: RescueFloodWarningsV2ListData? = null
)

data class RescueFloodWarningsV2ListData(
    val schemaVersion: Int? = null,
    val floodAlerts: List<RescueFloodWarningV2Dto?>? = null,
    val serverTime: String? = null
)

data class RescueFloodWarningsV2DetailResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val data: RescueFloodWarningsV2DetailData? = null
)

data class RescueFloodWarningsV2DetailData(
    val floodAlert: RescueFloodWarningV2Dto? = null,
    val serverTime: String? = null
)

data class RescueFloodWarningV2Dto(
    val id: String? = null,
    val schemaVersion: Int? = null,
    val title: String? = null,
    val content: String? = null,
    val status: String? = null,
    val scope: String? = null,
    val startAt: String? = null,
    val endAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val revision: Int? = null
)

data class RescueFloodWarningsV2ZonesResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val data: RescueFloodWarningsV2ZonesData? = null
)

data class RescueFloodWarningsV2ZonesData(
    val zonesRevision: String? = null,
    val generatedAt: String? = null,
    val coverage: RescueFloodWarningsV2Coverage? = null,
    val geojson: RescueFloodWarningsV2GeoJson? = null
)

data class RescueFloodWarningsV2Coverage(
    val status: String? = null,
    val totalZones: Int? = null,
    val evaluableZones: Int? = null,
    val unassessableZones: JsonElement? = null
)

data class RescueFloodWarningsV2GeoJson(
    val type: String? = null,
    val features: List<RescueFloodWarningsV2Feature?>? = null
)

data class RescueFloodWarningsV2Feature(
    val type: String? = null,
    val geometry: JsonElement? = null,
    val properties: RescueFloodWarningsV2ZoneProperties? = null
)

data class RescueFloodWarningsV2ZoneProperties(
    val zoneId: String? = null,
    val group: String? = null,
    val name: String? = null,
    val sourceKind: String? = null,
    val sourceId: String? = null,
    val source: String? = null,
    val recordedAt: String? = null,
    val dataUpdatedAt: String? = null,
    val datasetVersion: String? = null,
    val geometryStatus: String? = null
)
