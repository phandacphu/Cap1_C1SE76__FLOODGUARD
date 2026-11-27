package com.example.floodguard.data.repository

import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Test
import retrofit2.Response

class RescueSafeLocationRoadRepositoryTest {

    private val gps = RescueCatalogGps(16.0, 108.0)

    private fun location(
        id: String = "loc-a",
        latitude: Double = 16.1,
        longitude: Double = 108.1
    ) = RescueCatalogLocation(
        id = id,
        name = id,
        address = "Test address",
        latitude = latitude,
        longitude = longitude,
        type = "shelter",
        description = null,
        distanceKm = 0.5
    )

    private fun row(
        location: RescueCatalogLocation,
        meters: Long?
    ) = SafeRoadResult(
        locationId = location.id,
        destination = SafeRoadPoint(
            location.latitude,
            location.longitude
        ),
        distanceMeters = meters
    )

    private fun ok(
        vararg rows: SafeRoadResult,
        provider: String = "openrouteservice",
        mode: String = "DRIVE"
    ): Response<SafeRoadResponse> =
        Response.success(
            SafeRoadResponse(
                success = true,
                data = SafeRoadData(
                    provider = provider,
                    travelMode = mode,
                    results = rows.toList()
                )
            )
        )

    private class FakeApi : RescueSafeLocationRoadApi {

        val requests = mutableListOf<SafeRoadRequest>()

        var handler: suspend (SafeRoadRequest) ->
            Response<SafeRoadResponse> = {
                error("Unexpected request")
            }

        override suspend fun estimate(
            request: SafeRoadRequest
        ): Response<SafeRoadResponse> {
            requests.add(request)
            return handler(request)
        }
    }

    private suspend fun expectFailure(
        block: suspend () -> Unit
    ) {
        var failed = false

        try {
            block()
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            failed = true
        }

        assertTrue("Expected request failure", failed)
    }

    @Test
    fun validDistanceAndRequestContract() = runBlocking {
        val api = FakeApi()
        val a = location()

        api.handler = { ok(row(a, 1234L)) }

        val repo = RescueSafeLocationRoadRepository(api)
        val result = repo.estimate(gps, listOf(a))

        assertEquals(1234L, result[a.id]?.meters)
        assertEquals(listOf(a.id), api.requests.single().locationIds)
        assertEquals(
            SafeRoadPoint(gps.latitude, gps.longitude),
            api.requests.single().origin
        )
        assertTrue(result[a.id]!!.matches(a))
    }

    @Test
    fun zeroDistanceIsValid() = runBlocking {
        val api = FakeApi()
        val a = location()

        api.handler = { ok(row(a, 0L)) }

        val result = RescueSafeLocationRoadRepository(api)
            .estimate(gps, listOf(a))

        assertEquals(0L, result[a.id]?.meters)
        assertEquals("0,0 km", formatSafeRoadDistance(0L))
    }

    @Test
    fun nullDistanceDoesNotFallbackToAirDistance() = runBlocking {
        val api = FakeApi()
        val a = location()

        api.handler = { ok(row(a, null)) }

        val result = RescueSafeLocationRoadRepository(api)
            .estimate(gps, listOf(a))

        assertTrue(result.containsKey(a.id))
        assertNull(result[a.id]?.meters)
        assertEquals(
            "Chưa xác định",
            formatSafeRoadDistance(result[a.id]?.meters)
        )
    }

    @Test
    fun negativeDistanceIsRejected() = runBlocking {
        val api = FakeApi()
        val a = location()

        api.handler = { ok(row(a, -1L)) }

        expectFailure {
            RescueSafeLocationRoadRepository(api)
                .estimate(gps, listOf(a))
        }
    }

    @Test
    fun unexpectedResponseIdIsRejected() = runBlocking {
        val api = FakeApi()
        val a = location()

        api.handler = {
            ok(row(location("unexpected"), 500L))
        }

        expectFailure {
            RescueSafeLocationRoadRepository(api)
                .estimate(gps, listOf(a))
        }
    }

    @Test
    fun duplicateResponseIdsAreRejected() = runBlocking {
        val api = FakeApi()
        val a = location("a")
        val b = location("b")

        api.handler = {
            ok(row(a, 100L), row(a, 200L))
        }

        expectFailure {
            RescueSafeLocationRoadRepository(api)
                .estimate(gps, listOf(a, b))
        }
    }

    @Test
    fun missingResponseRowsAreRejected() = runBlocking {
        val api = FakeApi()
        val a = location()

        api.handler = { ok() }

        expectFailure {
            RescueSafeLocationRoadRepository(api)
                .estimate(gps, listOf(a))
        }
    }

    @Test
    fun wrongProviderIsRejected() = runBlocking {
        val api = FakeApi()
        val a = location()

        api.handler = {
            ok(row(a, 100L), provider = "unknown")
        }

        expectFailure {
            RescueSafeLocationRoadRepository(api)
                .estimate(gps, listOf(a))
        }
    }

    @Test
    fun wrongTravelModeIsRejected() = runBlocking {
        val api = FakeApi()
        val a = location()

        api.handler = {
            ok(row(a, 100L), mode = "WALK")
        }

        expectFailure {
            RescueSafeLocationRoadRepository(api)
                .estimate(gps, listOf(a))
        }
    }

    @Test
    fun changedDestinationDoesNotDisplayWrongDistance() = runBlocking {
        val api = FakeApi()
        val a = location()
        val moved = a.copy(latitude = 16.2)

        api.handler = { ok(row(moved, 100L)) }

        val result = RescueSafeLocationRoadRepository(api)
            .estimate(gps, listOf(a))

        assertNull(result[a.id]?.meters)
    }

    @Test
    fun sameGpsAndLocationsReuseCache() = runBlocking {
        val api = FakeApi()
        val a = location("a")
        val b = location("b")

        api.handler = {
            ok(row(a, 100L), row(b, 200L))
        }

        val repo = RescueSafeLocationRoadRepository(api)

        val first = repo.estimate(gps, listOf(a, b))
        val second = repo.estimate(gps, listOf(b, a))

        assertEquals(first, second)
        assertEquals(1, api.requests.size)
    }

    @Test
    fun newGpsInvalidatesCache() = runBlocking {
        val api = FakeApi()
        val a = location()

        api.handler = { ok(row(a, 100L)) }

        val repo = RescueSafeLocationRoadRepository(api)

        repo.estimate(gps, listOf(a))
        repo.estimate(
            RescueCatalogGps(16.2, 108.2),
            listOf(a)
        )

        assertEquals(2, api.requests.size)
    }

    @Test
    fun changedCoordinatesInvalidateCache() = runBlocking {
        val api = FakeApi()
        val a = location()
        val moved = a.copy(latitude = 16.2)

        val repo = RescueSafeLocationRoadRepository(api)

        api.handler = { ok(row(a, 100L)) }
        repo.estimate(gps, listOf(a))

        api.handler = { ok(row(moved, 500L)) }
        val result = repo.estimate(gps, listOf(moved))

        assertEquals(2, api.requests.size)
        assertEquals(500L, result[a.id]?.meters)
    }

    @Test
    fun httpFailureDoesNotPreventRetry() = runBlocking {
        val api = FakeApi()
        val a = location()

        val repo = RescueSafeLocationRoadRepository(api)

        api.handler = {
            Response.error(
                429,
                "".toResponseBody(null)
            )
        }

        expectFailure {
            repo.estimate(gps, listOf(a))
        }

        api.handler = { ok(row(a, 300L)) }

        val result = repo.estimate(gps, listOf(a))

        assertEquals(300L, result[a.id]?.meters)
        assertEquals(2, api.requests.size)
    }

    @Test
    fun offlineFailureDoesNotPreventRetry() = runBlocking {
        val api = FakeApi()
        val a = location()

        val repo = RescueSafeLocationRoadRepository(api)

        api.handler = { throw IOException("offline") }

        expectFailure {
            repo.estimate(gps, listOf(a))
        }

        api.handler = { ok(row(a, 600L)) }

        val result = repo.estimate(gps, listOf(a))

        assertEquals(600L, result[a.id]?.meters)
    }

    @Test
    fun cancellationIsPropagated() = runBlocking {
        val api = FakeApi()
        val a = location()

        api.handler = {
            throw CancellationException("cancelled")
        }

        var cancelled = false

        try {
            RescueSafeLocationRoadRepository(api)
                .estimate(gps, listOf(a))
        } catch (_: CancellationException) {
            cancelled = true
        }

        assertTrue(cancelled)
    }

    @Test
    fun invalidGpsDoesNotSendRequest() = runBlocking {
        val api = FakeApi()

        expectFailure {
            RescueSafeLocationRoadRepository(api)
                .estimate(
                    RescueCatalogGps(Double.NaN, 108.0),
                    listOf(location())
                )
        }

        assertTrue(api.requests.isEmpty())
    }

    @Test
    fun emptyLocationsDoNotSendRequest() = runBlocking {
        val api = FakeApi()

        val result = RescueSafeLocationRoadRepository(api)
            .estimate(gps, emptyList())

        assertTrue(result.isEmpty())
        assertTrue(api.requests.isEmpty())
    }

    @Test
    fun duplicateInputIdsDoNotSendRequest() = runBlocking {
        val api = FakeApi()
        val a = location()

        expectFailure {
            RescueSafeLocationRoadRepository(api)
                .estimate(gps, listOf(a, a))
        }

        assertTrue(api.requests.isEmpty())
    }

    @Test
    fun moreThan100LocationsAreSplitIntoBatches() = runBlocking {
        val api = FakeApi()

        val locations = (1..101).map {
            location("loc-$it")
        }

        val byId = locations.associateBy { it.id }

        api.handler = { request ->
            val rows = request.locationIds.map { id ->
                row(byId.getValue(id), 100L)
            }

            ok(*rows.toTypedArray())
        }

        val result = RescueSafeLocationRoadRepository(api)
            .estimate(gps, locations)

        assertEquals(101, result.size)
        assertEquals(2, api.requests.size)

        assertEquals(
            listOf(100, 1),
            api.requests.map { it.locationIds.size }
        )
    }

    @Test
    fun distanceFormattingUsesVietnameseLocale() {
        assertEquals("1,2 km", formatSafeRoadDistance(1234L))
        assertEquals("12,5 km", formatSafeRoadDistance(12500L))
        assertEquals("Chưa xác định", formatSafeRoadDistance(null))
        assertEquals("Chưa xác định", formatSafeRoadDistance(-1L))
    }
}
