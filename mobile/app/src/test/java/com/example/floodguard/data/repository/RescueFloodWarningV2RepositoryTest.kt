package com.example.floodguard.data.repository

import com.example.floodguard.data.remote.api.RescueFloodWarningV2Api
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class RescueFloodWarningV2RepositoryTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: RescueFloodWarningV2Repository

    @Before
    fun setup() {
        server = MockWebServer()
        server.start()

        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request().newBuilder()
                    .header(
                        "Authorization",
                        "Bearer mock-rescue-token"
                    )
                    .build()
                chain.proceed(request)
            }
            .build()

        val api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(RescueFloodWarningV2Api::class.java)

        repository = RescueFloodWarningV2Repository(api)
    }

    @After
    fun cleanup() {
        server.shutdown()
    }

    private fun enqueue(body: String, code: Int = 200) {
        server.enqueue(
            MockResponse()
                .setResponseCode(code)
                .addHeader("Content-Type", "application/json")
                .setBody(body)
        )
    }

    private fun alert(
        id: String = "TEST-01",
        status: String = "active",
        endAt: String? = null,
        schemaVersion: Int = 2
    ): String {
        val endValue = endAt?.let { "\"$it\"" } ?: "null"

        return """
        {
          "id": "$id",
          "schemaVersion": $schemaVersion,
          "title": "Cảnh báo kiểm thử",
          "content": "Mưa lớn, theo dõi hướng dẫn.",
          "status": "$status",
          "scope": "all_published_zones",
          "startAt": "2026-11-22T01:00:00.000Z",
          "endAt": $endValue,
          "createdAt": "2026-11-22T01:00:00.000Z",
          "updatedAt": "2026-11-22T01:00:00.000Z",
          "revision": 1
        }
        """.trimIndent()
    }

    private fun listJson(
        items: String,
        schemaVersion: Int = 2
    ) = """
        {
          "success": true,
          "message": "OK",
          "data": {
            "schemaVersion": $schemaVersion,
            "floodAlerts": [$items],
            "serverTime": "2026-11-22T02:00:00.000Z"
          }
        }
    """.trimIndent()

    private fun detailJson(item: String) = """
        {
          "success": true,
          "message": "OK",
          "data": {
            "floodAlert": $item,
            "serverTime": "2026-11-22T02:00:00.000Z"
          }
        }
    """.trimIndent()

    private fun <T> success(
        result: RescueWarningV2Result<T>
    ): T = when (result) {
        is RescueWarningV2Result.Success -> result.data
        is RescueWarningV2Result.Failure ->
            throw AssertionError(result.message)
    }

    private fun <T> failure(
        result: RescueWarningV2Result<T>
    ): RescueWarningV2Result.Failure = when (result) {
        is RescueWarningV2Result.Failure -> result
        is RescueWarningV2Result.Success ->
            throw AssertionError("Expected failure")
    }

    @Test
    fun acceptsEmpty200List() = runBlocking {
        enqueue(listJson(""))

        val warnings = success(repository.getWarnings())

        assertTrue(warnings.isEmpty())
        assertEquals("/api/flood-alerts", server.takeRequest().path)
    }

    @Test
    fun loadsMultipleActiveWarnings() = runBlocking {
        enqueue(listJson("${alert(id = "B")},${alert(id = "A")}"))

        val warnings = success(repository.getActiveWarnings())

        assertEquals(2, warnings.size)
        assertEquals("A", warnings[0].id)
        assertEquals("B", warnings[1].id)
        assertTrue(warnings.all { it.isActive })

        assertEquals(
            "/api/flood-alerts/active",
            server.takeRequest().path
        )
    }

    @Test
    fun sendsOnlySupportedFiltersAndBearer() = runBlocking {
        enqueue(listJson(alert()))

        success(
            repository.getWarnings(
                status = "active",
                query = "mưa"
            )
        )

        val request = server.takeRequest()

        assertEquals(
            "/api/flood-alerts",
            request.requestUrl?.encodedPath
        )
        assertEquals(
            "active",
            request.requestUrl?.queryParameter("status")
        )
        assertEquals(
            "mưa",
            request.requestUrl?.queryParameter("q")
        )
        assertEquals(
            "Bearer mock-rescue-token",
            request.getHeader("Authorization")
        )
    }

    @Test
    fun preservesNullEndAtForActive() = runBlocking {
        enqueue(detailJson(alert()))

        val warning = success(repository.getDetail("TEST-01"))

        assertTrue(warning.isActive)
        assertNull(warning.endAt)
        assertEquals("TEST-01", warning.id)
    }

    @Test
    fun acceptsInactiveHistoryWithEndAt() = runBlocking {
        enqueue(
            listJson(
                alert(
                    status = "inactive",
                    endAt = "2026-11-22T03:00:00.000Z"
                )
            )
        )

        val warnings = success(
            repository.getWarnings(status = "inactive")
        )

        assertEquals(1, warnings.size)
        assertFalse(warnings[0].isActive)
        assertNotNull(warnings[0].endAt)
    }

    @Test
    fun rejectsV1SchemaRatherThanShowingEmpty() = runBlocking {
        enqueue(listJson(alert(), schemaVersion = 1))

        val result = failure(repository.getWarnings())

        assertEquals(
            RescueWarningV2FailureKind.INVALID_RESPONSE,
            result.kind
        )
    }

    @Test
    fun rejectsInvalidInactiveEndAt() = runBlocking {
        enqueue(listJson(alert(status = "inactive")))

        val result = failure(repository.getWarnings())

        assertEquals(
            RescueWarningV2FailureKind.INVALID_RESPONSE,
            result.kind
        )
    }

    @Test
    fun detail404IsNotAnotherWarning() = runBlocking {
        enqueue("{}", 404)

        val result = failure(
            repository.getDetail("MISSING-ID")
        )

        assertEquals(
            RescueWarningV2FailureKind.NOT_FOUND,
            result.kind
        )
    }

    @Test
    fun preservesUnauthorizedAndForbiddenErrors() = runBlocking {
        enqueue("{}", 401)
        enqueue("{}", 403)

        val unauthorized = failure(repository.getWarnings())
        val forbidden = failure(repository.getWarnings())

        assertEquals(
            RescueWarningV2FailureKind.UNAUTHORIZED,
            unauthorized.kind
        )
        assertEquals(
            RescueWarningV2FailureKind.FORBIDDEN,
            forbidden.kind
        )
    }

    @Test
    fun rejectsDetailWithWrongId() = runBlocking {
        enqueue(detailJson(alert(id = "OTHER-ID")))

        val result = failure(
            repository.getDetail("EXPECTED-ID")
        )

        assertEquals(
            RescueWarningV2FailureKind.INVALID_RESPONSE,
            result.kind
        )
    }
}
