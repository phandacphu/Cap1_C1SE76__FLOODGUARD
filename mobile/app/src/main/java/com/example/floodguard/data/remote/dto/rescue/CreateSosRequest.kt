package com.example.floodguard.data.remote.dto.rescue

data class CreateSosLocation(
    val latitude: Double,
    val longitude: Double
)

data class CreateSosRequest(
    val location: CreateSosLocation,
    val situations: List<String>,
    val numberOfPeople: Int,
    val waterLevel: String,
    val note: String?
)