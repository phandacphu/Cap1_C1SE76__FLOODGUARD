package com.example.floodguard.ui.screens.map

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CitizenGpsPolicyTest {

    @Test
    fun freshFix_isAccepted() {
        assertTrue(usable())
    }

    @Test
    fun fixFromPreviousSession_isRejected() {
        assertFalse(usable(fix = 99L))
    }

    @Test
    fun futureFix_isRejected() {
        assertFalse(usable(fix = 201L))
    }

    @Test
    fun missingFixTimestamp_isRejected() {
        assertFalse(usable(fix = 0L))
    }

    @Test
    fun nonFiniteCoordinates_areRejected() {
        listOf(
            Double.NaN,
            Double.POSITIVE_INFINITY,
            Double.NEGATIVE_INFINITY
        ).forEach { value ->
            assertFalse(usable(latitude = value))
            assertFalse(usable(longitude = value))
        }
    }

    @Test
    fun outOfRangeCoordinates_areRejected() {
        assertFalse(usable(latitude = 90.01))
        assertFalse(usable(latitude = -90.01))
        assertFalse(usable(longitude = 180.01))
        assertFalse(usable(longitude = -180.01))
    }

    @Test
    fun oldFixWithinCurrentSession_isRejected() {
        val second = 1_000_000_000L

        assertFalse(
            isCitizenGpsFixUsable(
                latitude = 16.0,
                longitude = 108.0,
                fixNanos = 2L * second,
                sessionStartNanos = second,
                nowNanos = 20L * second
            )
        )
    }

    @Test
    fun fixBeforeExpiry_isAccepted() {
        val second = 1_000_000_000L

        assertTrue(
            isCitizenGpsFixUsable(
                latitude = 16.0,
                longitude = 108.0,
                fixNanos = 2L * second,
                sessionStartNanos = second,
                nowNanos = 16L * second
            )
        )
    }

    @Test
    fun fixAtExpiry_isRejected() {
        val second = 1_000_000_000L

        assertFalse(
            isCitizenGpsFixUsable(
                latitude = 16.0,
                longitude = 108.0,
                fixNanos = 2L * second,
                sessionStartNanos = second,
                nowNanos = 17L * second
            )
        )
    }

    private fun usable(
        latitude: Double = 16.0,
        longitude: Double = 108.0,
        fix: Long = 150L
    ): Boolean {
        return isCitizenGpsFixUsable(
            latitude = latitude,
            longitude = longitude,
            fixNanos = fix,
            sessionStartNanos = 100L,
            nowNanos = 200L
        )
    }
}