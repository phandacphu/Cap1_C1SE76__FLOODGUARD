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
    val id: String = "",
    val name: String = "",
    val description: String? = null,
    val geometry: FloodGeometryDto = FloodGeometryDto(),

    // Tương thích các caller cũ.
    // Bản đồ người dân sẽ không dùng hai trường này.
    val severity: String = "",
    val status: String = "",

    val source: String = "",
    val areaType: String? = null
)

data class FloodGeometryDto(
    val type: String = "",
    val points: List<FloodPointDto> = emptyList()
)

data class FloodPointDto(
    val latitude: Double = Double.NaN,
    val longitude: Double = Double.NaN
)