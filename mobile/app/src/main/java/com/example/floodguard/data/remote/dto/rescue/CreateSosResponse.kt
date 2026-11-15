package com.example.floodguard.data.remote.dto.rescue

data class CreateSosResponse(
    val success: Boolean,
    val message: String? = null,
    val data: CreateSosResponseData? = null
)

data class CreateSosResponseData(
    val rescueRequest: CreatedSosDto? = null
)

data class CreatedSosDto(
    val id: String,
    val status: String,
    val urgency: String? = null,
    val numberOfPeople: Int? = null,

    val residentId: String? = null,
    val state: String? = null,
    val location: SosCoordinates? = null,
    val initialLocation: SosCoordinates? = null,
    val locationCapturedAt: String? = null,
    val locationReceivedAt: String? = null,
    val situations: List<String>? = null,
    val waterLevel: String? = null,
    val note: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val completedBy: String? = null,
    val completedAt: String? = null
)