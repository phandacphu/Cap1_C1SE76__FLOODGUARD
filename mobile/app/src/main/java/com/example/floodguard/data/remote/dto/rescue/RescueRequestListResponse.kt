
package com.example.floodguard.data.remote.dto.rescue

data class RescueRequestListResponse(
    val success: Boolean,
    val message: String? = null,
    val data: RescueRequestListData? = null
)

data class RescueRequestListData(
    val rescueRequests: List<RescueRequestDto> = emptyList()
)

data class RescueRequestDto(
    val id: String? = null,
    val residentId: String? = null,
    val urgency: String? = null,
    val numberOfPeople: Int? = null,
    val note: String? = null,
    val status: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
)
