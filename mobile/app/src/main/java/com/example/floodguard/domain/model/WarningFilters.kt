package com.example.floodguard.domain.model

import java.time.Instant
import java.util.Locale

fun filterWarnings(
    warnings: List<Warning>,
    selectedStatus: String,
    selectedSeverity: String
): List<Warning> {
    return warnings.filter { warning ->
        val matchesStatus = when (selectedStatus) {
            "effective" -> warning.timeStatus == WarningTimeStatus.EFFECTIVE
            "upcoming" -> warning.timeStatus == WarningTimeStatus.UPCOMING
            "expired" -> warning.timeStatus == WarningTimeStatus.EXPIRED
            "disabled" -> warning.timeStatus == WarningTimeStatus.DISABLED
            else -> true
        }

        matchesStatus &&
                (selectedSeverity == "all" ||
                        warning.severity.equals(selectedSeverity, ignoreCase = true))
    }.sortedWith(
        compareByDescending<Warning> {
            when (it.severity.lowercase(Locale.ROOT)) {
                "critical" -> 4
                "high" -> 3
                "medium" -> 2
                "low" -> 1
                else -> 0
            }
        }.thenByDescending {
            runCatching { Instant.parse(it.startTime) }
                .getOrDefault(Instant.MIN)
        }
    )
}