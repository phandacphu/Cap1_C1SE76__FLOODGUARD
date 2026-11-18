package com.example.floodguard.data.model

data class RescueSafeLocationsResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val data: RescueSafeLocationsData? = null
)

data class RescueSafeLocationsData(
    val safeLocations: List<RescueSafeLocationDto?>? = null
)

data class RescueSafeLocationDetailResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val data: RescueSafeLocationDetailData? = null
)

data class RescueSafeLocationDetailData(
    val safeLocation: RescueSafeLocationDto? = null
)

data class RescueSafeLocationDto(
    val id: String? = null,
    val name: String? = null,
    val address: String? = null,
    val location: RescueSafeLocationCoordinatesDto? = null,
    val type: String? = null,
    val description: String? = null,
    val distanceKm: Double? = null
)

data class RescueSafeLocationCoordinatesDto(
    val latitude: Double? = null,
    val longitude: Double? = null
)
