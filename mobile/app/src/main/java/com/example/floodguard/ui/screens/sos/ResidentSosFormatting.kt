package com.example.floodguard.ui.screens.sos

import com.example.floodguard.data.remote.dto.rescue.SosCoordinates
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

fun residentSosStateLabel(state: String?): String =
    when (state) {
        "active" -> "Đã gửi — chờ cứu hộ"
        "rescued" -> "Đã cứu"
        "legacy_other" -> "Yêu cầu lưu trữ"
        else -> "Chưa có thông tin"
    }

fun residentSosSituationLabel(code: String): String =
    when (code) {
        "trapped" -> "Bị mắc kẹt do ngập"
        "evacuation" -> "Cần sơ tán"
        "injured" -> "Có người bị thương"
        "vulnerable" -> "Người già/trẻ nhỏ cần hỗ trợ"
        "other" -> "Tình huống khác"
        else -> "Tình huống chưa xác định"
    }

fun residentSosWaterLabel(code: String?): String? =
    when (code) {
        "below_knee" -> "Dưới đầu gối"
        "waist" -> "Đến thắt lưng"
        "chest" -> "Đến ngực"
        "above_two_meters" -> "Trên 2 m"
        else -> null
    }

fun residentSosPosition(position: SosCoordinates?): String? {
    val latitude = position?.latitude ?: return null
    val longitude = position.longitude ?: return null

    if (
        !latitude.isFinite() ||
        !longitude.isFinite() ||
        latitude !in -90.0..90.0 ||
        longitude !in -180.0..180.0
    ) {
        return null
    }

    return String.format(
        Locale.US,
        "%.6f, %.6f",
        latitude,
        longitude
    )
}

fun residentSosTime(value: String?): String? {
    if (value.isNullOrBlank()) return null

    return try {
        DateTimeFormatter
            .ofPattern("dd/MM/yyyy HH:mm:ss", Locale.forLanguageTag("vi-VN"))
            .withZone(ZoneId.of("Asia/Ho_Chi_Minh"))
            .format(Instant.parse(value))
    } catch (_: Exception) {
        null
    }
}