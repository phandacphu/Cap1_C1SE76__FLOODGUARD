package com.example.floodguard.data.repository

import com.example.floodguard.data.model.RescueSafeLocationDetailResponse
import com.example.floodguard.data.model.RescueSafeLocationsResponse
import com.example.floodguard.data.remote.api.RescueSafeLocationApi
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class RescueSafeLocationRepositoryTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: RescueSafeLocationRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()

        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        repository = RescueSafeLocationRepository(
            retrofit.create(RescueSafeLocationApi::class.java)
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun itemJson(
        id: String = "loc-1",
        lat: String = "0",
        lng: String = "0",
        distance: String = "0",
        type: String = "shelter"
    ): String = """
        {
          "id":"$id",
          "name":"Điểm tránh trú A",
          "address":"Đà Nẵng",
          "location":{"latitude":$lat,"longitude":$lng},
          "type":"$type",
          "description":"Dữ liệu kiểm thử",
          "distanceKm":$distance
        }
    """.trimIndent()

    private fun listJson(vararg items: String): String =
        """{"success":true,"data":{"safeLocations":[${items.joinToString(",")}]}}"""

    private fun enqueue(body: String, status: Int = 200) {
        server.enqueue(
            MockResponse()
                .setResponseCode(status)
                .setHeader("Content-Type", "application/json")
                .setBody(body)
        )
    }

    private fun <T> success(result: RescueCatalogResult<T>): T =
        when (result) {
            is RescueCatalogResult.Success -> result.data
            is RescueCatalogResult.Failure ->
                throw AssertionError("Expected success, got $result")
        }

    private fun failure(
        result: RescueCatalogResult<*>
    ): RescueCatalogResult.Failure =
        when (result) {
            is RescueCatalogResult.Failure -> result
            is RescueCatalogResult.Success ->
                throw AssertionError("Expected failure, got $result")
        }

    @Test
    fun listWithoutGpsUsesCorrectEndpoint() {
        enqueue(listJson(itemJson(distance = "3.5")))

        runBlocking {
            val locations = success(repository.getLocations())

            assertEquals(1, locations.size)
            assertEquals("loc-1", locations.single().id)
            assertNull(locations.single().distanceKm)
        }

        val request = server.takeRequest()
        assertEquals("/api/safe-locations", request.path)
        assertNull(request.getHeader("Authorization"))
    }

    @Test
    fun gpsZeroCoordinatesAndZeroDistanceAreValid() {
        enqueue(listJson(itemJson()))

        runBlocking {
            val locations = success(
                repository.getLocations(RescueCatalogGps(0.0, 0.0))
            )

            val location = locations.single()
            assertEquals(0.0, location.latitude, 0.0)
            assertEquals(0.0, location.longitude, 0.0)
            assertEquals(0.0, location.distanceKm!!, 0.0)
        }

        val url = server.takeRequest().requestUrl!!
        assertEquals("0.0", url.queryParameter("latitude"))
        assertEquals("0.0", url.queryParameter("longitude"))
        assertEquals(
            setOf("latitude", "longitude"),
            url.queryParameterNames
        )
    }

    @Test
    fun emptyListIsSuccessfulNotAnError() {
        enqueue(listJson())

        runBlocking {
            assertTrue(success(repository.getLocations()).isEmpty())
        }
    }

    @Test
    fun detailUsesCorrectIdAndGps() {
        enqueue(
            """{"success":true,"data":{"safeLocation":${itemJson()}}}"""
        )

        runBlocking {
            val location = success(
                repository.getDetail(
                    "loc-1",
                    RescueCatalogGps(0.0, 0.0)
                )
            )

            assertEquals("loc-1", location.id)
            assertEquals("Dữ liệu kiểm thử", location.description)
            assertEquals(0.0, location.distanceKm!!, 0.0)
        }

        val url = server.takeRequest().requestUrl!!
        assertEquals("/api/safe-locations/loc-1", url.encodedPath)
        assertEquals("0.0", url.queryParameter("latitude"))
        assertEquals("0.0", url.queryParameter("longitude"))
    }

    @Test
    fun missingListPayloadIsInvalidResponse() {
        enqueue("""{"success":true,"data":{}}""")

        runBlocking {
            assertEquals(
                RescueCatalogFailureKind.INVALID_RESPONSE,
                failure(repository.getLocations()).kind
            )
        }
    }

    @Test
    fun invalidServerCoordinatesAreRejected() {
        enqueue(listJson(itemJson(lat = "91")))

        runBlocking {
            assertEquals(
                RescueCatalogFailureKind.INVALID_RESPONSE,
                failure(repository.getLocations()).kind
            )
        }
    }

    @Test
    fun negativeDistanceIsRejected() {
        enqueue(listJson(itemJson(distance = "-1")))

        runBlocking {
            assertEquals(
                RescueCatalogFailureKind.INVALID_RESPONSE,
                failure(repository.getLocations()).kind
            )
        }
    }

    @Test
    fun unsupportedLocationTypeIsRejected() {
        enqueue(listJson(itemJson(type = "unsupported")))

        runBlocking {
            assertEquals(
                RescueCatalogFailureKind.INVALID_RESPONSE,
                failure(repository.getLocations()).kind
            )
        }
    }

    @Test
    fun http400IsBadRequest() {
        enqueue("""{"success":false}""", 400)

        runBlocking {
            assertEquals(
                RescueCatalogFailureKind.BAD_REQUEST,
                failure(repository.getLocations()).kind
            )
        }
    }

    @Test
    fun detail404IsNotFound() {
        enqueue(
            """{"success":false,"code":"SAFE_LOCATION_NOT_FOUND"}""",
            404
        )

        runBlocking {
            val result = failure(repository.getDetail("deleted-id"))

            assertEquals(
                RescueCatalogFailureKind.NOT_FOUND,
                result.kind
            )
            assertEquals(
                "Địa điểm không còn được cung cấp.",
                result.message
            )
        }
    }

    @Test
    fun http500IsServerError() {
        enqueue("""{"success":false}""", 500)

        runBlocking {
            assertEquals(
                RescueCatalogFailureKind.SERVER,
                failure(repository.getLocations()).kind
            )
        }
    }

    @Test
    fun invalidGpsDoesNotSendRequest() {
        runBlocking {
            assertEquals(
                RescueCatalogFailureKind.INVALID_GPS,
                failure(
                    repository.getLocations(
                        RescueCatalogGps(Double.NaN, 0.0)
                    )
                ).kind
            )
        }

        assertEquals(0, server.requestCount)
    }

    @Test
    fun blankDetailIdDoesNotSendRequest() {
        runBlocking {
            assertEquals(
                RescueCatalogFailureKind.INVALID_ID,
                failure(repository.getDetail("  ")).kind
            )
        }

        assertEquals(0, server.requestCount)
    }

    @Test
    fun detailWithDifferentIdIsInvalidResponse() {
        enqueue(
            """{"success":true,"data":{"safeLocation":${itemJson(id = "other")}}}"""
        )

        runBlocking {
            assertEquals(
                RescueCatalogFailureKind.INVALID_RESPONSE,
                failure(repository.getDetail("loc-1")).kind
            )
        }
    }

    @Test
    fun networkIOExceptionIsReported() {
        val failingRepository = RescueSafeLocationRepository(
            ThrowingApi(IOException("offline"))
        )

        runBlocking {
            assertEquals(
                RescueCatalogFailureKind.NETWORK,
                failure(failingRepository.getLocations()).kind
            )
        }
    }

    @Test
    fun coroutineCancellationIsNotSwallowed() {
        val cancellingRepository = RescueSafeLocationRepository(
            ThrowingApi(CancellationException("cancelled"))
        )

        var propagated = false

        try {
            runBlocking {
                cancellingRepository.getLocations()
            }
        } catch (_: CancellationException) {
            propagated = true
        }

        assertTrue(
            "CancellationException must be propagated",
            propagated
        )
    }

    private class ThrowingApi(
        private val error: Exception
    ) : RescueSafeLocationApi {

        override suspend fun getSafeLocations(
            latitude: Double?,
            longitude: Double?
        ): Response<RescueSafeLocationsResponse> {
            throw error
        }

        override suspend fun getSafeLocationDetail(
            id: String,
            latitude: Double?,
            longitude: Double?
        ): Response<RescueSafeLocationDetailResponse> {
            throw error
        }
    }
}
