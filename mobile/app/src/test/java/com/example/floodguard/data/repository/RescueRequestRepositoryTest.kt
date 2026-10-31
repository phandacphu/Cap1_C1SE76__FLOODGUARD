
package com.example.floodguard.data.repository

import com.example.floodguard.data.remote.api.RescueRequestApi
import com.example.floodguard.data.remote.dto.rescue.CreateSosLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class RescueRequestRepositoryTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: RescueRequestRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()

        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val api = retrofit.create(
            RescueRequestApi::class.java
        )

        repository = RescueRequestRepository(api)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun sampleRequest() = CreateSosRequest(
        location = CreateSosLocation(
            latitude = 16.0544,
            longitude = 108.2022
        ),
        urgency = "high",
        numberOfPeople = 3,
        note = "Cần hỗ trợ sơ tán"
    )

    @Test
    fun createSos_success201() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setBody(
                    """
                    {
                      "success": true,
                      "message": "SOS request created successfully",
                      "data": {
                        "rescueRequest": {
                          "id": "test-sos-001",
                          "status": "submitted",
                          "urgency": "high",
                          "numberOfPeople": 3
                        }
                      }
                    }
                    """.trimIndent()
                )
        )

        val result = repository.createSos(sampleRequest())

        assertTrue(result.isSuccess)
        assertEquals(
            "test-sos-001",
            result.getOrNull()?.id
        )

        val recorded = server.takeRequest(
            1,
            TimeUnit.SECONDS
        )

        assertNotNull(recorded)
        assertEquals("POST", recorded?.method)
        assertEquals(
            "/api/rescue-requests",
            recorded?.path
        )

        val body = recorded!!.body.readUtf8()
        assertTrue(body.contains("\"urgency\":\"high\""))
        assertTrue(body.contains("\"numberOfPeople\":3"))
        assertTrue(body.contains("\"latitude\":16.0544"))
        assertTrue(body.contains("\"longitude\":108.2022"))
        assertFalse(body.contains("\"residentId\""))
    }

    @Test
    fun createSos_error400() = runBlocking {
        assertHttpError(
            400,
            "Thông tin SOS không hợp lệ"
        )
    }

    @Test
    fun createSos_error401() = runBlocking {
        assertHttpError(
            401,
            "Phiên đăng nhập"
        )
    }

    @Test
    fun createSos_error403() = runBlocking {
        assertHttpError(
            403,
            "không có quyền"
        )
    }

    @Test
    fun createSos_error409() = runBlocking {
        assertHttpError(
            409,
            "đã có yêu cầu SOS"
        )
    }

    @Test
    fun createSos_error500() = runBlocking {
        assertHttpError(
            500,
            "Máy chủ"
        )
    }

    private suspend fun assertHttpError(
        statusCode: Int,
        expectedMessage: String
    ) {
        server.enqueue(
            MockResponse()
                .setResponseCode(statusCode)
                .setBody(
                    """{"success":false,"message":"Test error"}"""
                )
        )

        val result = repository.createSos(sampleRequest())

        assertTrue(result.isFailure)

        assertTrue(
            result.exceptionOrNull()
                ?.message
                ?.contains(expectedMessage, ignoreCase = true)
                    == true
        )
    }

    @Test
    fun createSos_connectionFailure() = runBlocking {
        server.enqueue(
            MockResponse()
                .setSocketPolicy(
                    SocketPolicy.DISCONNECT_AT_START
                )
        )

        val result = repository.createSos(
            sampleRequest()
        )

        assertTrue(result.isFailure)

        val message = result.exceptionOrNull()
            ?.message
            .orEmpty()

        assertTrue(
            message.contains("kết nối", ignoreCase = true) ||
                    message.contains("trạng thái", ignoreCase = true)
        )
    }

    @Test
    fun createSos_timeoutDoesNotRetry() = runBlocking {
        // Server nhận yêu cầu nhưng không trả phản hồi
        server.enqueue(
            MockResponse()
                .setSocketPolicy(SocketPolicy.NO_RESPONSE)
        )

        val client = OkHttpClient.Builder()
            .connectTimeout(1, TimeUnit.SECONDS)
            .readTimeout(1, TimeUnit.SECONDS)
            .writeTimeout(1, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val testRepository = RescueRequestRepository(
            retrofit.create(RescueRequestApi::class.java)
        )

        val result = testRepository.createSos(sampleRequest())

        assertTrue(result.isFailure)

        val message = result.exceptionOrNull()
            ?.message
            .orEmpty()

        assertTrue(
            message.contains(
                "kiểm tra trạng thái",
                ignoreCase = true
            )
        )

        // Kiểm tra chỉ gửi một HTTP request
        assertEquals(1, server.requestCount)
    }
}
