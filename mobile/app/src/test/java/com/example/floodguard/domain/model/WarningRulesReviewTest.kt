package com.example.floodguard.domain.model

import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

class WarningRulesReviewTest {
    private val start = "2026-11-08T10:00:00Z"
    private val end = "2026-11-08T11:00:00Z"

    private fun resolve(
        now: String,
        status: String = "active",
        startAt: String = start,
        endAt: String? = end
    ) = resolveWarningTimeStatus(
        status, startAt, endAt, Instant.parse(now)
    )

    @Test
    fun timeBoundaries_areInclusive() {
        assertEquals(
            WarningTimeStatus.UPCOMING,
            resolve("2026-11-08T09:59:59.999Z")
        )
        assertEquals(WarningTimeStatus.EFFECTIVE, resolve(start))
        assertEquals(WarningTimeStatus.EFFECTIVE, resolve(end))
        assertEquals(
            WarningTimeStatus.EXPIRED,
            resolve("2026-11-08T11:00:00.001Z")
        )
    }

    @Test
    fun inactive_isDisabled() {
        assertEquals(
            WarningTimeStatus.DISABLED,
            resolve(start, "inactive", "bad-date", null)
        )
    }

    @Test
    fun invalidStatusOrDates_areUnknown() {
        assertEquals(
            WarningTimeStatus.UNKNOWN,
            resolve(start, status = "unsupported")
        )
        assertEquals(
            WarningTimeStatus.UNKNOWN,
            resolve(start, startAt = "bad-date")
        )
        assertEquals(
            WarningTimeStatus.UNKNOWN,
            resolve(start, endAt = null)
        )
        assertEquals(
            WarningTimeStatus.UNKNOWN,
            resolve(start, endAt = start)
        )
        assertEquals(
            WarningTimeStatus.UNKNOWN,
            resolve(start, endAt = "2026-11-08T09:00:00Z")
        )
    }

    @Test
    fun nextUpdate_crossesEndBoundary() {
        assertEquals(
            1L,
            nextWarningStatusUpdateDelayMillis(
                start, end, Instant.parse(end)
            )
        )
        assertEquals(
            60_000L,
            nextWarningStatusUpdateDelayMillis(
                start, end, Instant.parse("2026-11-08T08:00:00Z")
            )
        )
    }

    private fun warning(
        id: String,
        status: WarningTimeStatus,
        severity: String,
        time: String = start
    ) = Warning(
        id = id,
        title = id,
        content = "Kiểm thử",
        severity = severity,
        area = "Khu vực kiểm thử",
        startTime = time,
        endTime = end,
        timeStatus = status
    )

    @Test
    fun filtersCombineStatusAndSeverity() {
        val warnings = listOf(
            warning("A", WarningTimeStatus.EFFECTIVE, "high"),
            warning("B", WarningTimeStatus.EXPIRED, "high"),
            warning("C", WarningTimeStatus.EFFECTIVE, "low"),
            warning("D", WarningTimeStatus.UNKNOWN, "high")
        )

        assertEquals(
            listOf("A"),
            filterWarnings(warnings, "effective", "high").map { it.id }
        )
        assertEquals(
            listOf("B"),
            filterWarnings(warnings, "expired", "all").map { it.id }
        )
        assertEquals(4, filterWarnings(warnings, "all", "all").size)
        assertTrue(
            filterWarnings(warnings, "disabled", "critical").isEmpty()
        )
    }

    @Test
    fun sortingUsesSeverityThenNewestStart() {
        val warnings = listOf(
            warning("low", WarningTimeStatus.EFFECTIVE, "low"),
            warning(
                "old", WarningTimeStatus.EFFECTIVE, "HIGH",
                "2026-11-08T09:00:00Z"
            ),
            warning("new", WarningTimeStatus.EFFECTIVE, "high"),
            warning("critical", WarningTimeStatus.EFFECTIVE, "critical")
        )

        assertEquals(
            listOf("critical", "new", "old", "low"),
            filterWarnings(warnings, "all", "all").map { it.id }
        )
    }
}