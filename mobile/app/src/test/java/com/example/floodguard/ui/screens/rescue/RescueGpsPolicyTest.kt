package com.example.floodguard.ui.screens.rescue

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RescueGpsPolicyTest {
    private val now = 60_000_000_000L

    @Test
    fun firstRequestIsNotMistakenForPermanentDenial() {
        assertEquals(RescueGpsPermission.NOT_REQUESTED, rescueGpsPermission(false, false, false, false))
    }

    @Test
    fun retryableDenialOffersAnotherPermissionRequest() {
        assertEquals(RescueGpsPermission.DENIED, rescueGpsPermission(false, false, true, true))
    }

    @Test
    fun deniedWithoutRationaleAfterRequestRequiresSettings() {
        assertEquals(RescueGpsPermission.BLOCKED, rescueGpsPermission(false, false, true, false))
    }

    @Test
    fun approximateGrantIsUsableEvenWhenFinePermissionWasDenied() {
        val permission = rescueGpsPermission(false, true, true, false)
        assertEquals(RescueGpsPermission.APPROXIMATE, permission)
        assertTrue(permission.isGranted)
    }

    @Test
    fun preciseGrantOverridesOldDenialHistory() {
        val permission = rescueGpsPermission(true, true, true, false)
        assertEquals(RescueGpsPermission.PRECISE, permission)
        assertTrue(permission.isGranted)
        assertFalse(RescueGpsPermission.BLOCKED.isGranted)
    }

    @Test
    fun validCoordinatesIncludeEquatorAndRangeBoundaries() {
        listOf(0.0 to 0.0, -90.0 to -180.0, 90.0 to 180.0, 16.0544 to 108.2022)
            .forEach { (latitude, longitude) ->
                assertNull(rescueGpsFixFailure(latitude, longitude, now, now))
            }
    }

    @Test
    fun nonFiniteCoordinatesAreRejected() {
        listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY).forEach { value ->
            assertEquals(RescueGpsFailure.INVALID_LOCATION, rescueGpsFixFailure(value, 108.0, now, now))
            assertEquals(RescueGpsFailure.INVALID_LOCATION, rescueGpsFixFailure(16.0, value, now, now))
        }
    }

    @Test
    fun coordinatesOutsideTheEarthRangeAreRejected() {
        listOf(90.0001 to 108.0, -90.0001 to 108.0, 16.0 to 180.0001, 16.0 to -180.0001)
            .forEach { (latitude, longitude) ->
                assertEquals(RescueGpsFailure.INVALID_LOCATION, rescueGpsFixFailure(latitude, longitude, now, now))
            }
    }

    @Test
    fun locationExactlyThirtySecondsOldIsUsable() {
        assertNull(rescueGpsFixFailure(16.0, 108.0, now - 30_000_000_000L, now))
    }

    @Test
    fun locationOlderThanThirtySecondsIsRejected() {
        assertEquals(RescueGpsFailure.STALE_LOCATION, rescueGpsFixFailure(16.0, 108.0, now - 30_000_000_001L, now))
    }

    @Test
    fun unknownAndFutureTimestampsAreRejected() {
        listOf(0L, -1L, now + 1L).forEach { timestamp ->
            assertEquals(RescueGpsFailure.STALE_LOCATION, rescueGpsFixFailure(16.0, 108.0, timestamp, now))
        }
    }
}
