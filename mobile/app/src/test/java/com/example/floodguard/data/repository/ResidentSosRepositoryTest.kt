package com.example.floodguard.data.repository

import com.example.floodguard.data.remote.api.ResidentSosApi
import com.example.floodguard.data.remote.dto.rescue.CreateSosLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.google.gson.JsonParser
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class ResidentSosRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: ResidentSosRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()

        val api = Retrofit.Builder()
            .baseUrl(server.url("/api/"))
            .client(
                OkHttpClient.Builder()
                    .retryOnConnectionFailure(false)
                    .build()
            )
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ResidentSosApi::class.java)

        repository = ResidentSosRepository(api)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun enqueue(
        json: String,
        code: Int = 200
    ) {
        server.enqueue(
            MockResponse()
                .setResponseCode(code)
                .setHeader("Content-Type", "application/json")
                .setBody(json)
        )
    }

    private fun createRequest() = CreateSosRequest(
        location = CreateSosLocation(16.0544, 108.2022),
        situations = listOf("trapped", "injured"),
        numberOfPeople = 3,
        waterLevel = "waist",
        note = "TEST"
    )

    private fun detailJson(id: String = "SOS-A") = """
        {
          "success": true,
          "data": {
            "rescueRequest": {
              "id": "$id",
              "state": "active",
              "status": "submitted"
            }
          }
        }
    """.trimIndent()

    @Test
    fun create_usesApiPathAndContractPayload_withoutUrgency() = runTest {
        enqueue(detailJson(), code = 201)

        val result = repository.create(createRequest())

        assertTrue(result.isSuccess)
        assertEquals("SOS-A", result.getOrNull()?.id)
        assertNull(result.getOrNull()?.urgency)

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/rescue-requests", request.path)

        val json = JsonParser.parseString(request.body.readUtf8())
            .asJsonObject

        assertEquals(
            setOf(
                "location", "situations", "numberOfPeople",
                "waterLevel", "note"
            ),
            json.keySet()
        )
        assertTrue(json["numberOfPeople"].asJsonPrimitive.isNumber)
        assertEquals(3, json["numberOfPeople"].asInt)
    }

    @Test
    fun lists_useOfficialStateQueries() = runTest {
        val empty = """
            {"success":true,"data":{"rescueRequests":[]}}
        """.trimIndent()

        enqueue(empty)
        enqueue(empty)

        assertEquals(emptyList<Any>(), repository.getActive().getOrThrow())
        assertEquals(emptyList<Any>(), repository.getRescued().getOrThrow())

        assertEquals(
            "/api/rescue-requests?state=active&sort=newest",
            server.takeRequest().path
        )
        assertEquals(
            "/api/rescue-requests?state=rescued&sort=newest",
            server.takeRequest().path
        )
    }

    @Test
    fun malformedLists_areFailures_notEmptyHistory() = runTest {
        val invalid = listOf(
            """{"success":true,"data":null}""",
            """{"success":true,"data":{"rescueRequests":null}}""",
            """{"success":true,"data":{"rescueRequests":[null]}}""",
            """{"success":true,"data":{"rescueRequests":[{}]}}""",
            """{"success":true,"data":{"rescueRequests":[{"id":"A"},{"id":"A"}]}}"""
        )

        invalid.forEach { json ->
            enqueue(json)
            assertTrue(repository.getActive().isFailure)
        }
    }

    @Test
    fun duplicateCreate_preservesCodeAndExistingId_withoutRetry() = runTest {
        enqueue(
            """
            {
              "success": false,
              "code": "DUPLICATE_SOS_REQUEST",
              "data": {"activeRequestId": "EXISTING"}
            }
            """.trimIndent(),
            code = 409
        )

        val error = repository.create(createRequest())
            .exceptionOrNull() as ResidentSosApiException

        assertEquals(409, error.statusCode)
        assertEquals("DUPLICATE_SOS_REQUEST", error.code)
        assertEquals("EXISTING", error.activeRequestId)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun detailAndHistory_useExactId_andAllowMissingLegacyFacts() = runTest {
        enqueue(detailJson())
        enqueue(
            """
            {
              "success": true,
              "data": {
                "requestId": "SOS-A",
                "statusHistory": []
              }
            }
            """.trimIndent()
        )

        val detail = repository.getDetail("SOS-A").getOrThrow()
        assertEquals("active", detail.state)
        assertNull(detail.initialLocation)
        assertNull(detail.locationCapturedAt)

        assertTrue(repository.getHistory("SOS-A").getOrThrow().isEmpty())

        assertEquals(
            "/api/rescue-requests/SOS-A",
            server.takeRequest().path
        )
        assertEquals(
            "/api/rescue-requests/SOS-A/history",
            server.takeRequest().path
        )

        enqueue(detailJson(id = "OTHER"))
        assertTrue(repository.getDetail("SOS-A").isFailure)
    }

    @Test
    fun locationPatch_usesActualSampleTime_withThreeMillisecondDigits() =
        runTest {
            enqueue(detailJson())

            val result = repository.updateLocation(
                id = "SOS-A",
                latitude = 16.055,
                longitude = 108.203,
                capturedAtMillis = 1_000L
            )

            assertTrue(result.isSuccess)

            val request = server.takeRequest()
            assertEquals("PATCH", request.method)
            assertEquals(
                "/api/rescue-requests/SOS-A/location",
                request.path
            )

            val json = JsonParser.parseString(request.body.readUtf8())
                .asJsonObject

            assertEquals(
                setOf("location", "capturedAt"),
                json.keySet()
            )
            assertEquals(
                "1970-01-01T00:00:01.000Z",
                json["capturedAt"].asString
            )
        }

    @Test
    fun httpErrors_preserveAuthorizationAndDistinctGpsCodes() = runTest {
        listOf(
            401 to "SOS_AUTH_REQUIRED",
            403 to "SOS_OWNER_FORBIDDEN",
            409 to "STALE_SOS_LOCATION",
            409 to "SOS_NOT_ACTIVE",
            409 to "SOS_LOCATION_TIME_UNAVAILABLE",
            400 to "INVALID_SOS_LOCATION"
        ).forEach { (status, code) ->
            enqueue(
                """{"success":false,"code":"$code"}""",
                code = status
            )

            val error = repository.updateLocation(
                "SOS-A",
                16.055,
                108.203,
                1_000L
            ).exceptionOrNull() as ResidentSosApiException

            assertEquals(status, error.statusCode)
            assertEquals(code, error.code)
        }
    }
    @Test
    fun historyMalformedResponse_isFailure_notEmptyHistory() = runTest {
        val invalidResponses = listOf(
            """{"success":true,"data":null}""",
            """{"success":true,"data":{"requestId":"OTHER","statusHistory":[]}}""",
            """{"success":true,"data":{"requestId":"SOS-A","statusHistory":null}}""",
            """{"success":true,"data":{"requestId":"SOS-A","statusHistory":[null]}}"""
        )

        invalidResponses.forEach { json ->
            enqueue(json)
            assertTrue(repository.getHistory("SOS-A").isFailure)
        }
    }
}