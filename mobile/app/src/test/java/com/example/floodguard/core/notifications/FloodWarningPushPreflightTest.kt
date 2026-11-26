package com.example.floodguard.core.notifications

import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.model.parseFloodLocationV2Evaluation
import com.example.floodguard.data.remote.api.NotificationDeviceRegistration
import com.example.floodguard.data.repository.ConfirmedNotificationDevice
import com.example.floodguard.data.repository.FloodWarningV2
import com.example.floodguard.data.repository.ObsoleteNotificationSessionException
import com.google.gson.JsonParser
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.runBlocking
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import retrofit2.HttpException
import retrofit2.Response

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class FloodWarningPushPreflightTest {
    private val now = Instant.parse("2026-11-24T09:00:30Z")

    private fun manager() =
        SessionManager(RuntimeEnvironment.getApplication())

    private data class Fixture(
        val session: AuthenticatedSessionSnapshot,
        val identity: NotificationInstallationIdentity,
        val binding: SavedNotificationBinding
    )

    private suspend fun fixture(manager: SessionManager): Fixture {
        val account = UUID.randomUUID().toString()

        check(
            manager.saveAuthenticatedSession(
                token = "test-token-$account",
                user = SessionUser(id = account, role = "resident"),
                expectedGeneration = manager.getGeneration()
            )
        )

        val session = requireNotNull(manager.getSessionSnapshot())
        val identity = NotificationInstallationIdentity(
            UUID.randomUUID().toString(),
            "A".repeat(64)
        )
        val store = NotificationBindingStore(manager)

        val registration = NotificationDeviceRegistration(
            fcmToken = null,
            notificationPermission = "denied",
            registrationId = session.registrationId,
            expectedBindingId = null,
            expectedRevision = 0
        )

        check(
            store.savePending(
                session, identity.installationId, registration
            )
        )
        check(
            store.confirm(
                session,
                identity.installationId,
                registration,
                ConfirmedNotificationDevice(
                    identity.installationId,
                    UUID.randomUUID().toString(),
                    1,
                    "denied",
                    false
                )
            )
        )

        return Fixture(
            session,
            identity,
            requireNotNull(store.getConfirmed(session))
        )
    }

    private fun push(
        fixture: Fixture,
        kind: String = "general",
        bindingId: String = fixture.binding.bindingId
    ) = FloodWarningV2Push.parse(
        mapOf(
            "schemaVersion" to "2",
            "eventId" to "test-event",
            "alertId" to "test-alert",
            "kind" to kind,
            "title" to "Kiểm thử",
            "body" to "Nội dung kiểm thử.",
            "createdAt" to "2026-11-24T09:00:00Z",
            "installationId" to fixture.identity.installationId,
            "bindingId" to bindingId
        )
    ).getOrThrow()

    private fun alert() = FloodWarningV2(
        id = "test-alert",
        title = "Bản tin kiểm thử",
        content = "Nội dung kiểm thử.",
        status = "active",
        scope = "all_published_zones",
        startAt = "2026-11-24T08:00:00Z",
        endAt = null,
        createdAt = "2026-11-24T08:00:00Z",
        updatedAt = "2026-11-24T08:00:00Z",
        revision = 1
    )

    @Test
    fun generalReadsExactDetailWithoutCallingGpsApi() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val fixture = fixture(manager)
        var detailCalls = 0

        val preflight = FloodWarningPushPreflight(
            sessionManager = manager,
            readAlert = { capturedSession, alertId ->
                detailCalls++
                assertEquals(fixture.session.generation, capturedSession.generation)
                assertEquals("test-alert", alertId)
                Result.success(alert())
            },
            readEvaluation = { _, _, _ ->
                error("General không được phụ thuộc GPS.")
            },
            clock = { now }
        )

        val result = preflight.prepare(
            fixture.session, fixture.identity, push(fixture)
        ).getOrThrow()

        assertEquals(FloodWarningPushCheck.ALLOW_GENERAL, result.decision)
        assertEquals(1, detailCalls)
    }

    @Test
    fun controlAndWrongTargetDoNotReadDetail() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val fixture = fixture(manager)

        val preflight = FloodWarningPushPreflight(
            sessionManager = manager,
            readAlert = { _, _ -> error("Không được gọi detail.") },
            clock = { now }
        )

        assertEquals(
            FloodWarningPushCheck.CONTROL_ONLY,
            preflight.prepare(
                fixture.session,
                fixture.identity,
                push(fixture, "deactivated")
            ).getOrThrow().decision
        )

        assertEquals(
            FloodWarningPushCheck.WRONG_TARGET,
            preflight.prepare(
                fixture.session,
                fixture.identity,
                push(fixture, bindingId = "old-binding")
            ).getOrThrow().decision
        )
    }

    @Test
    fun accountChangeWhileReadingDetailRejectsLateResult() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val accountA = fixture(manager)

        val preflight = FloodWarningPushPreflight(
            sessionManager = manager,
            readAlert = { _, _ ->
                fixture(manager) // Đổi sang tài khoản B trước khi A trả về.
                Result.success(alert())
            },
            clock = { now }
        )

        val result = preflight.prepare(
            accountA.session, accountA.identity, push(accountA)
        )

        assertTrue(
            result.exceptionOrNull() is ObsoleteNotificationSessionException
        )
    }

    @Test
    fun detail404DoesNotFallBackToAnotherAlertOrGps() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val fixture = fixture(manager)
        var calls = 0

        val preflight = FloodWarningPushPreflight(
            sessionManager = manager,
            readAlert = { _, _ ->
                calls++
                Result.failure(
                    HttpException(
                        Response.error<Any>(
                            404, "{}".toResponseBody()
                        )
                    )
                )
            },
            readEvaluation = { _, _, _ ->
                error("Không được gọi GPS sau detail 404.")
            },
            clock = { now }
        )

        val result = preflight.prepare(
            fixture.session, fixture.identity, push(fixture, "near")
        )

        assertTrue(result.exceptionOrNull() is HttpException)
        assertEquals(1, calls)
    }

    @Test
    fun newSequenceWhileReadingEvaluationRejectsOldPosition() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val fixture = fixture(manager)
        val store = NotificationBindingStore(manager)

        assertEquals(
            1L,
            store.nextLocationSequence(
                fixture.session,
                fixture.identity.installationId,
                fixture.binding.bindingId
            )
        )

        val oldEvaluation = parseFloodLocationV2Evaluation(
            JsonParser.parseString(
                """
                {
                  "success": true,
                  "data": {
                    "evaluation": {
                      "installationId": "${fixture.identity.installationId}",
                      "bindingId": "${fixture.binding.bindingId}",
                      "sequence": 1,
                      "location": {"latitude":16.0544,"longitude":108.2022},
                      "capturedAt": "2026-11-24T09:00:00.000Z",
                      "receivedAt": "2026-11-24T09:00:01.000Z",
                      "accuracyM": 20,
                      "validUntil": "2026-11-24T09:01:00.000Z",
                      "evaluatedAt": "2026-11-24T09:00:20.000Z",
                      "zonesRevision": "TEST",
                      "status": "near",
                      "reason": null,
                      "coverage": {
                        "status": "complete",
                        "totalZones": 1,
                        "evaluableZones": 1,
                        "unassessableZones": []
                      },
                      "matches": [{
                        "zoneId":"test-zone",
                        "group":"historical_flood",
                        "name":"Vùng kiểm thử",
                        "relation":"near",
                        "distanceToBoundaryM":100,
                        "source":"TEST",
                        "recordedAt":null
                      }],
                      "activeAlertIds":["test-alert"]
                    }
                  }
                }
                """.trimIndent()
            ).asJsonObject,
            fixture.identity.installationId,
            fixture.binding.bindingId
        )

        val preflight = FloodWarningPushPreflight(
            sessionManager = manager,
            isLocationUsable = { true },
            readAlert = { _, _ -> Result.success(alert()) },
            readEvaluation = { _, _, _ ->
                store.nextLocationSequence(
                    fixture.session,
                    fixture.identity.installationId,
                    fixture.binding.bindingId
                )
                Result.success(oldEvaluation)
            },
            clock = { now }
        )

        assertEquals(
            FloodWarningPushCheck.LOCATION_UNVERIFIED,
            preflight.prepare(
                fixture.session, fixture.identity, push(fixture, "near")
            ).getOrThrow().decision
        )
    }
}