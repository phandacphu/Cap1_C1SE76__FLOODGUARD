
package com.example.floodguard.data.model

data class SafeLocationsResponse(
    val success: Boolean,
    val message: String? = null,
    val data: SafeLocationsData? = null
)

data class SafeLocationsData(
    val safeLocations: List<SafeLocationDto> = emptyList()
)

data class SafeLocationDto(
    val id: String,
    val name: String,
    val address: String,
    val location: SafeLocationCoordinatesDto,
    val type: String,
    val capacity: Int,
    val capacityNote: String? = null,
    val description: String? = null,
    val contactPhone: String? = null,
    val status: String,
    val services: List<SafeLocationServiceDto> = emptyList(),
    val distanceKm: Double? = null
)

data class SafeLocationCoordinatesDto(
    val latitude: Double,
    val longitude: Double
)

data class SafeLocationServiceDto(
    val id: String,
    val name: String,
    val description: String? = null,
    val isAvailable: Boolean
)
