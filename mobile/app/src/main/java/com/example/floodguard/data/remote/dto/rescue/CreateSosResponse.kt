
package com.example.floodguard.data.remote.dto.rescue

data class CreateSosResponse(
    val success: Boolean,
    val message: String?,
    val data: CreateSosResponseData?
)

data class CreateSosResponseData(
    val rescueRequest: CreatedSosDto?
)

data class CreatedSosDto(
    val id: String,
    val status: String,
    val urgency: String,
    val numberOfPeople: Int
)
