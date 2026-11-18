package com.example.floodguard.data.remote.dto.rescue

data class SosCoordinates(
    val latitude: Double? = null,
    val longitude: Double? = null
)

data class RescueRequestListResponse(
    val success: Boolean,
    val message: String? = null,
    val data: RescueRequestListData? = null
)

data class RescueRequestListData(
    val rescueRequests: List<RescueRequestDto?>? = null
)

data class RescueRequestDto(
    val id: String? = null,
    val residentId: String? = null,

    val status: String? = null,
    val state: String? = null,

    val location: SosCoordinates? = null,
    val initialLocation: SosCoordinates? = null,
    val locationCapturedAt: String? = null,
    val locationReceivedAt: String? = null,

    val situations: List<String>? = null,
    val numberOfPeople: Int? = null,
    val waterLevel: String? = null,
    val note: String? = null,

    val createdAt: String? = null,
    val updatedAt: String? = null,
    val completedBy: String? = null,
    val completedAt: String? = null,

    // Giữ tương thích với code/test cũ trong lúc chuyển đổi.
    // Backend mới không trả trường này; UI không sử dụng.
    val urgency: String? = null
)