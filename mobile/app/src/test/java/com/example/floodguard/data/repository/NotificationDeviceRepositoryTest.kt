package com.example.floodguard.data.repository

import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.remote.api.NotificationDeviceRegistration
import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.net.InetAddress

class NotificationDeviceRepositoryTest {

    private lateinit var server: MockWebServer

    private val installationId = UUID.randomUUID().toString()
    private val bindingId = UUID.randomUUID().toString()
    private val registrationId = UUID.randomUUID().toString()

    // Chỉ dùng với MockWebServer, không gửi tới Backend thật.
    private val identity = NotificationInstallationIdentity(
        installationId,
        "A".repeat(64)
    )

    private val session = AuthenticatedSessionSnapshot(
        generation = 1,
        registrationId = registrationId,
        user = SessionUser(id = "test-account", role = "resident"),
        accessToken = "test-captured-jwt"
    )

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start(
            InetAddress.getByName("127.0.0.1"),
            0
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun sendsCapturedJwtAndAllSixFieldsIncludingNulls() = runBlocking {
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "success": true,
                      "data": {
                        "device": {
                          "installationId": "$installationId",
                          "bindingId": "$bindingId",
                          "revision": 1,
                          "platform": "android",
                          "notificationPermission": "denied",
                          "pushEligible": false
                        }
                      }
                    }
                    """.trimIndent()
                )
        )

        val repository = NotificationDeviceRepository.create(
            "http://127.0.0.1:${server.port}/"
        )

        val result = repository.register(
            session,
            identity,
            NotificationDeviceRegistration(
                fcmToken = null,
                notificationPermission = "denied",
                registrationId = registrationId,
                expectedBindingId = null,
                expectedRevision = 0
            )
        )

        assertTrue(result.isSuccess)
        assertEquals(bindingId, result.getOrThrow().bindingId)

        val request = requireNotNull(
            server.takeRequest(1, TimeUnit.SECONDS)
        )
        assertEquals(
            "/api/notification-devices/$installationId",
            request.path
        )
        assertEquals(
            "Bearer test-captured-jwt",
            request.getHeader("Authorization")
        )
        assertEquals(
            identity.installationSecret,
            request.getHeader("X-Installation-Secret")
        )

        val body = JsonParser.parseString(
            request.body.readUtf8()
        ).asJsonObject

        assertEquals(6, body.entrySet().size)
        assertTrue(body.get("fcmToken").isJsonNull)
        assertTrue(body.get("expectedBindingId").isJsonNull)
    }

    @Test
    fun tokenConflictIsReturnedWithoutAutomaticRetry() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(409)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "success": false,
                      "code": "DEVICE_TOKEN_CONFLICT"
                    }
                    """.trimIndent()
                )
        )

        val repository = NotificationDeviceRepository.create(
            "http://127.0.0.1:${server.port}/"
        )

        val result = repository.register(
            session,
            identity,
            NotificationDeviceRegistration(
                fcmToken = "test-token",
                notificationPermission = "granted",
                registrationId = registrationId,
                expectedBindingId = null,
                expectedRevision = 0
            )
        )

        assertTrue(result.isFailure)

        val error = result.exceptionOrNull()
        assertTrue(error is NotificationDeviceApiException)

        error as NotificationDeviceApiException
        assertEquals(409, error.httpStatus)
        assertEquals("DEVICE_TOKEN_CONFLICT", error.errorCode)
        assertEquals(1, server.requestCount)
    }
}