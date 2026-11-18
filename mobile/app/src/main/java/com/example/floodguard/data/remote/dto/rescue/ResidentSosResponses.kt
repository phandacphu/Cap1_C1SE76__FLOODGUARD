package com.example.floodguard.data.remote.dto.rescue

data class SosDetailResponse(
    val success: Boolean,
    val message: String? = null,
    val data: SosDetailData? = null
)

data class SosDetailData(
    val rescueRequest: RescueRequestDto? = null
)

data class SosHistoryResponse(
    val success: Boolean,
    val message: String? = null,
    val data: SosHistoryData? = null
)

data class SosHistoryData(
    val requestId: String? = null,
    val statusHistory: List<SosHistoryEventDto?>? = null
)

data class SosHistoryEventDto(
    val id: String? = null,
    val oldStatus: String? = null,
    val newStatus: String? = null,
    val changedBy: String? = null,
    val note: String? = null,
    val changedAt: String? = null
)

data class UpdateSosLocationRequest(
    val location: CreateSosLocation,
    val capturedAt: String
)

data class SosErrorResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val code: String? = null,
    val data: SosErrorData? = null
)

data class SosErrorData(
    val activeRequestId: String? = null
)