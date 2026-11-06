package com.example.floodguard.data.model

data class FloodAreasResponse(
    val success: Boolean,
    val message: String,
    val data: FloodAreasData
)

data class FloodAreasData(
    val floodAreas: List<FloodAreaDto>
)

data class FloodAreaDto(
    val id: String,
    val name: String,
    val description: String?,
    val geometry: FloodGeometryDto,
    // Legacy Resident consumers still reference these fields. Rescue uses only areaType.
    val severity: String,
    val status: String,
    val source: String,
    val areaType: String? = null
)

data class FloodGeometryDto(
    val type: String,
    val points: List<FloodPointDto>
)

data class FloodPointDto(
    val latitude: Double,
    val longitude: Double
)
