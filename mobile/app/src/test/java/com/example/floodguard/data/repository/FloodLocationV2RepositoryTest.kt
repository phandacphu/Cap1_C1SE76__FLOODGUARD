package com.example.floodguard.data.repository

import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.model.FloodLocationUnavailableReason
import com.example.floodguard.data.model.FloodLocationV2Upload
import com.google.gson.JsonArray
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.net.InetAddress
import java.util.UUID
import java.util.concurrent.TimeUnit

class FloodLocationV2RepositoryTest {

    private lateinit var server: MockWebServer

    private val identity = NotificationInstallationIdentity(
        UUID.randomUUID().toString(),
        "A".repeat(64)
    )

    private val binding = SavedNotificationBinding(
        installationId = identity.installationId,
        bindingId = UUID.randomUUID().toString(),
        revision = 1,
        sequence = 0
    )

    private val session = AuthenticatedSessionSnapshot(
        generation = 1,
        registrationId = UUID.randomUUID().toString(),
        user = SessionUser(id = "test-account", role = "resident"),
        accessToken = "test-captured-jwt"
    )

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start(InetAddress.getByName("127.0.0.1"), 0)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun repository() =
        FloodLocationV2Repository.create(
            "http://127.0.0.1:${server.port}/"
        )

    private fun response(
        sequence: Long = 1,
        returnedBindingId: String = binding.bindingId
    ): String {
        val evaluation = JsonObject().apply {
            addProperty("installationId", identity.installationId)
            addProperty("bindingId", returnedBindingId)
            addProperty("sequence", sequence)

            listOf(
                "location", "capturedAt", "receivedAt",
                "accuracyM", "validUntil"
            ).forEach {
                add(it, JsonNull.INSTANCE)
            }

            addProperty("evaluatedAt", "2026-11-24T09:00:20.000Z")
            addProperty("zonesRevision", "TEST-ZONES")
            addProperty("status", "unknown")
            addProperty("reason", "no_active_alert")
            add("matches", JsonArray())
            add("activeAlertIds", JsonArray())

            add(
                "coverage",
                JsonObject().apply {
                    addProperty("status", "complete")
                    addProperty("totalZones", 0)
                    addProperty("evaluableZones", 0)
                    add("unassessableZones", JsonArray())
                }
            )
        }

        return JsonObject().apply {
            addProperty("success", true)
            add(
                "data",
                JsonObject().apply {
                    add("evaluation", evaluation)
                }
            )
        }.toString()
    }

    @Test
    fun unavailableUploadSendsSixFieldsAndCapturedHeaders() = runBlocking {
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody(response())
        )

        val result = repository().uploadLocation(
            session,
            identity,
            binding,
            FloodLocationV2Upload.unavailable(
                1,
                FloodLocationUnavailableReason.PERMISSION_DENIED
            )
        )

        assertTrue(result.isSuccess)

        val request = requireNotNull(
            server.takeRequest(1, TimeUnit.SECONDS)
        )

        assertEquals("PUT", request.method)
        assertEquals("/api/flood-alerts/location", request.path)
        assertEquals(
            "Bearer test-captured-jwt",
            request.getHeader("Authorization")
        )
        assertEquals(
            identity.installationSecret,
            request.getHeader("X-Installation-Secret")
        )
        assertEquals(
            identity.installationId,
            request.getHeader("X-Installation-Id")
        )
        assertEquals(
            binding.bindingId,
            request.getHeader("X-Device-Binding-Id")
        )

        val body = JsonParser.parseString(
            request.body.readUtf8()
        ).asJsonObject

        assertEquals(6, body.entrySet().size)
        assertEquals("permission_denied", body.get("reason").asString)
        assertTrue(body.get("location").isJsonNull)
        assertTrue(body.get("capturedAt").isJsonNull)
        assertTrue(body.get("accuracyM").isJsonNull)
    }

    @Test
    fun rejectsEvaluationForAnotherBinding() = runBlocking {
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody(response(returnedBindingId = "old-binding"))
        )

        assertTrue(
            repository().getEvaluation(
                session, identity, binding
            ).isFailure
        )
    }

    @Test
    fun rejectsEvaluationOlderThanRequestedSequence() = runBlocking {
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody(response(sequence = 2))
        )

        assertTrue(
            repository().getEvaluation(
                session, identity, binding,
                minimumSequence = 3
            ).isFailure
        )
    }

    @Test
    fun sequenceConflictIsReturnedWithoutAutomaticRetry() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(409)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "success":false,
                      "code":"LOCATION_SEQUENCE_CONFLICT"
                    }
                    """.trimIndent()
                )
        )

        val result = repository().uploadLocation(
            session,
            identity,
            binding,
            FloodLocationV2Upload.unavailable(
                1,
                FloodLocationUnavailableReason.NO_FIX
            )
        )

        val error = result.exceptionOrNull()
        assertTrue(error is FloodLocationV2ApiException)

        error as FloodLocationV2ApiException
        assertEquals(409, error.httpStatus)
        assertEquals("LOCATION_SEQUENCE_CONFLICT", error.errorCode)
        assertEquals(1, server.requestCount)
    }
}