package com.example.floodguard.data.model

// Nullable tại biên JSON để repository phát hiện thiếu field,
// không coi response V1 hoặc sai cấu trúc là danh sách rỗng.
data class FloodWarningV2Dto(
    val id: String? = null,
    val schemaVersion: Int? = null,
    val title: String? = null,
    val content: String? = null,
    val status: String? = null,
    val scope: String? = null,
    val startAt: String? = null,
    val endAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val revision: Long? = null
)

data class FloodWarningV2ListResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val code: String? = null,
    val data: FloodWarningV2ListData? = null
)

data class FloodWarningV2ListData(
    val schemaVersion: Int? = null,
    val floodAlerts: List<FloodWarningV2Dto?>? = null,
    val serverTime: String? = null
)

data class FloodWarningV2DetailResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val code: String? = null,
    val data: FloodWarningV2DetailData? = null
)

data class FloodWarningV2DetailData(
    val floodAlert: FloodWarningV2Dto? = null,
    val serverTime: String? = null
)