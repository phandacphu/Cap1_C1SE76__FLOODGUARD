package com.example.floodguard.domain.model

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class WarningTimeStatus {
    DISABLED,
    UPCOMING,
    EFFECTIVE,
    EXPIRED,
    UNKNOWN
}

fun resolveWarningTimeStatus(
    status: String,
    startAt: String,
    endAt: String?,
    now: Instant = Instant.now()
): WarningTimeStatus {
    if (status.equals("inactive", ignoreCase = true)) {
        return WarningTimeStatus.DISABLED
    }
    if (!status.equals("active", ignoreCase = true)) {
        return WarningTimeStatus.UNKNOWN
    }

    val start = runCatching { Instant.parse(startAt) }.getOrNull()
        ?: return WarningTimeStatus.UNKNOWN
    val end = endAt?.takeIf { it.isNotBlank() }
        ?.let { runCatching { Instant.parse(it) }.getOrNull() }
        ?: return WarningTimeStatus.UNKNOWN

    if (!end.isAfter(start)) return WarningTimeStatus.UNKNOWN

    // Backend /active includes both startAt and endAt.
    return when {
        now.isBefore(start) -> WarningTimeStatus.UPCOMING
        now.isAfter(end) -> WarningTimeStatus.EXPIRED
        else -> WarningTimeStatus.EFFECTIVE
    }
}

fun warningTimeStatusLabel(status: WarningTimeStatus): String = when (status) {
    WarningTimeStatus.DISABLED -> "Đã tắt"
    WarningTimeStatus.UPCOMING -> "Chưa có hiệu lực"
    WarningTimeStatus.EFFECTIVE -> "Đang có hiệu lực"
    WarningTimeStatus.EXPIRED -> "Đã hết hạn"
    WarningTimeStatus.UNKNOWN -> "Chưa xác định thời gian"
}

fun warningSeverityLabel(severity: String): String = when (severity.lowercase(Locale.ROOT)) {
    "low", "thấp" -> "Thấp"
    "medium", "trung bình" -> "Trung bình"
    "high", "cao" -> "Cao"
    "critical", "khẩn cấp" -> "Khẩn cấp"
    else -> "Chưa xác định"
}

fun formatWarningDateTime(isoTime: String?): String {
    if (isoTime.isNullOrBlank()) return "Chưa xác định"
    return runCatching {
        Instant.parse(isoTime)
            .atZone(ZoneId.of("Asia/Ho_Chi_Minh"))
            .format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm", Locale.forLanguageTag("vi-VN")))
    }.getOrDefault("Chưa xác định")
}

/** Refresh at the next time boundary, with a bounded recheck for clock changes. */
fun nextWarningStatusUpdateDelayMillis(
    startAt: String,
    endAt: String?,
    now: Instant = Instant.now()
): Long {
    val boundaries = listOfNotNull(
        runCatching { Instant.parse(startAt) }.getOrNull(),
        endAt?.let {
            runCatching { Instant.parse(it).plusMillis(1) }.getOrNull()
        }
    )
    return boundaries.filter { it.isAfter(now) }
        .minOfOrNull { Duration.between(now, it).toMillis().coerceAtLeast(1L) }
        ?.coerceAtMost(60_000L) ?: 60_000L
}
