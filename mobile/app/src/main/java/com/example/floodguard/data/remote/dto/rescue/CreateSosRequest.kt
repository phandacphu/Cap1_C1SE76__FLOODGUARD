
package com.example.floodguard.data.remote.dto.rescue

data class CreateSosLocation(
    val latitude: Double,
    val longitude: Double
)

data class CreateSosRequest(
    val location: CreateSosLocation,
    val urgency: String,
    val numberOfPeople: Int,
    val note: String?
)
