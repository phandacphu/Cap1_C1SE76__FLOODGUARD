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
    val severity: String,
    val status: String,
    val source: String
)

data class FloodGeometryDto(
    val type: String,
    val points: List<FloodPointDto>
)

data class FloodPointDto(
    val latitude: Double,
    val longitude: Double
)