package com.example.floodguard.domain.model

data class Warning(
    val id: String,
    val title: String,
    val content: String,
    val severity: String,
    val area: String,
    val startTime: String,
    val endTime: String? = null,
    val isActive: Boolean = true,

    // Chỉ dùng để mock giao diện trong giai đoạn phát triển.
    // Không xem đây là cấu trúc bắt buộc của Warning API.
    val metricLeftLabel: String? = null,
    val metricLeftValue: String? = null,

    val metricRightLabel: String? = null,
    val metricRightValue: String? = null,

    val footerText: String? = null
)