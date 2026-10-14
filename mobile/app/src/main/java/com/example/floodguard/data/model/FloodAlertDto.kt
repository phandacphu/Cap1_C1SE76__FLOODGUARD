package com.example.floodguard.data.model

data class FloodAlertsResponse(
    val success: Boolean,
    val message: String,
    val data: FloodAlertsData
)

data class FloodAlertsData(
    val floodAlerts: List<FloodAlertDto>
)

data class FloodAlertDto(
    val id: String,
    val title: String,
    val content: String,
    val severity: String,
    val status: String,
    val areaId: String,
    val startAt: String,
    val endAt: String?
)