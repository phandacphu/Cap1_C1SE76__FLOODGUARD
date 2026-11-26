package com.example.floodguard.data.repository

import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.model.FloodLocationUnavailableReason
import com.example.floodguard.data.remote.api.FloodLocationV2Api
import com.example.floodguard.data.remote.api.NotificationDeviceRegistration
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import retrofit2.Response

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class FloodLocationV2CoordinatorTest {
    private fun manager() =
        SessionManager(RuntimeEnvironment.getApplication())

    private suspend fun login(
        manager: SessionManager,
        account: String
    ): AuthenticatedSessionSnapshot {
        check(
            manager.saveAuthenticatedSession(
                token = "test-token-$account",
                user = SessionUser(id = account, role = "resident"),
                expectedGeneration = manager.getGeneration()
            )
        )
        return requireNotNull(manager.getSessionSnapshot())
    }

    private suspend fun bind(
        store: NotificationBindingStore,
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity
    ): SavedNotificationBinding {
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
        return requireNotNull(store.getConfirmed(session))
    }

    @Test
    fun sequenceSurvivesNewCoordinatorAndFailedRequest() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val session = login(manager, "a")
        val identity = NotificationInstallationIdentity(
            UUID.randomUUID().toString(), "A".repeat(64)
        )
        val store = NotificationBindingStore(manager)
        val binding = bind(store, session, identity)
        val api = FakeApi().apply { failNext = true }

        val first = FloodLocationV2Coordinator(
            store, FloodLocationV2Repository(api)
        )

        assertTrue(
            first.uploadUnavailable(
                session,
                identity,
                binding,
                FloodLocationUnavailableReason.PERMISSION_DENIED
            ).isFailure
        )
        assertEquals(1, api.calls)
        assertEquals(1L, store.getConfirmed(session)?.sequence)

        val reopened = FloodLocationV2Coordinator(
            NotificationBindingStore(manager()),
            FloodLocationV2Repository(api)
        )

        assertTrue(
            reopened.uploadUnavailable(
                session,
                identity,
                binding,
                FloodLocationUnavailableReason.LOCATION_DISABLED
            ).isSuccess
        )

        // Đây là hai trạng thái mới, không phải retry mẫu đầu.
        assertEquals(listOf(1L, 2L), api.sequences)
        assertEquals(2L, store.getConfirmed(session)?.sequence)
    }

    @Test
    fun lateResponseFromAccountACannotBecomeAccountBResult() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val accountA = login(manager, "a")
        val identity = NotificationInstallationIdentity(
            UUID.randomUUID().toString(), "A".repeat(64)
        )
        val store = NotificationBindingStore(manager)
        val bindingA = bind(store, accountA, identity)
        var accountB: AuthenticatedSessionSnapshot? = null

        val api = FakeApi().apply {
            duringUpload = {
                accountB = login(manager, "b")
                bind(store, requireNotNull(accountB), identity)
            }
        }
        val coordinator = FloodLocationV2Coordinator(
            store, FloodLocationV2Repository(api)
        )

        val result = coordinator.uploadUnavailable(
            accountA,
            identity,
            bindingA,
            FloodLocationUnavailableReason.PERMISSION_DENIED
        )

        assertTrue(
            result.exceptionOrNull() is
                    ObsoleteFloodLocationContextException
        )
        assertEquals(
            0L,
            store.getConfirmed(requireNotNull(accountB))?.sequence
        )

        // Gọi tiếp bằng snapshot A cũng không được gửi HTTP.
        assertTrue(
            coordinator.uploadUnavailable(
                accountA,
                identity,
                bindingA,
                FloodLocationUnavailableReason.LOCATION_DISABLED
            ).isFailure
        )
        assertEquals(1, api.calls)
    }

    private class FakeApi : FloodLocationV2Api {
        var failNext = false
        var calls = 0
        val sequences = mutableListOf<Long>()
        var duringUpload: suspend () -> Unit = {}

        override suspend fun uploadLocation(
            authorization: String,
            installationSecret: String,
            installationId: String,
            bindingId: String,
            body: JsonObject
        ): Response<JsonObject> {
            calls++
            val sequence = body.get("sequence").asLong
            sequences += sequence

            if (failNext) {
                failNext = false
                throw IOException("Test timeout")
            }

            duringUpload()

            return Response.success(
                evaluation(
                    installationId,
                    bindingId,
                    sequence,
                    body.get("reason").asString
                )
            )
        }

        override suspend fun getEvaluation(
            authorization: String,
            installationSecret: String,
            installationId: String,
            bindingId: String
        ): Response<JsonObject> {
            error("Test này không gọi GET evaluation.")
        }

        private fun evaluation(
            installationId: String,
            bindingId: String,
            sequence: Long,
            reason: String
        ): JsonObject = JsonParser.parseString(
            """
            {
              "success": true,
              "data": {
                "evaluation": {
                  "installationId": "$installationId",
                  "bindingId": "$bindingId",
                  "sequence": $sequence,
                  "location": null,
                  "capturedAt": null,
                  "receivedAt": "2026-11-24T09:00:20.000Z",
                  "accuracyM": null,
                  "validUntil": null,
                  "evaluatedAt": "2026-11-24T09:00:20.000Z",
                  "zonesRevision": "TEST",
                  "status": "unknown",
                  "reason": "$reason",
                  "coverage": {
                    "status": "complete",
                    "totalZones": 1,
                    "evaluableZones": 1,
                    "unassessableZones": []
                  },
                  "matches": [],
                  "activeAlertIds": ["test-active-alert"]
                }
              }
            }
            """.trimIndent()
        ).asJsonObject
    }
}