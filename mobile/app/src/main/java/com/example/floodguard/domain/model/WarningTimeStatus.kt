
package com.example.floodguard.domain.model

import java.time.Instant

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
    if (!status.equals("active", ignoreCase = true)) {
        return WarningTimeStatus.DISABLED
    }

    val start = runCatching {
        Instant.parse(startAt)
    }.getOrNull() ?: return WarningTimeStatus.UNKNOWN

    val end = if (endAt.isNullOrBlank()) {
        null
    } else {
        runCatching {
            Instant.parse(endAt)
        }.getOrNull() ?: return WarningTimeStatus.UNKNOWN
    }

    if (end != null && end.isBefore(start)) {
        return WarningTimeStatus.UNKNOWN
    }

    return when {
        end != null && !now.isBefore(end) ->
            WarningTimeStatus.EXPIRED

        now.isBefore(start) ->
            WarningTimeStatus.UPCOMING

        else ->
            WarningTimeStatus.EFFECTIVE
    }
}
