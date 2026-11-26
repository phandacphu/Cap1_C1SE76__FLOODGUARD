package com.example.floodguard.data.repository

import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.remote.api.NotificationDeviceApi
import com.example.floodguard.core.notifications.FloodWarningPushDecision
import com.example.floodguard.core.notifications.FloodWarningPushReceiptStore
import com.example.floodguard.core.notifications.FloodWarningV2Push
import com.google.gson.JsonObject
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import retrofit2.Response
import java.io.IOException
import java.util.UUID
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class NotificationBindingCoordinatorTest {

    private fun manager() =
        SessionManager(RuntimeEnvironment.getApplication())

    private suspend fun login(
        manager: SessionManager,
        account: String
    ): AuthenticatedSessionSnapshot {
        assertTrue(
            manager.saveAuthenticatedSession(
                token = "test-token-$account",
                user = SessionUser(id = account, role = "resident"),
                expectedGeneration = manager.getGeneration()
            )
        )
        return requireNotNull(manager.getSessionSnapshot())
    }

    private fun identity() = NotificationInstallationIdentity(
        UUID.randomUUID().toString(),
        "A".repeat(64)
    )

    @Test
    fun firstRequestUsesRevisionReadFromGet() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val session = login(manager, "a")
        val identity = identity()

        val api = FakeDeviceApi(identity.installationId).apply {
            readBindingId = UUID.randomUUID().toString()
            readRevision = 7
        }
        val store = NotificationBindingStore(manager)
        val coordinator = NotificationBindingCoordinator(
            manager, store, NotificationDeviceRepository(api)
        )

        val result = coordinator.synchronize(
            session, identity, null, "denied"
        )

        assertTrue(result.isSuccess)
        assertEquals(1, api.getCalls)
        assertEquals(1, api.sentBodies.size)

        val body = api.sentBodies.single()
        assertEquals(
            api.readBindingId,
            body.get("expectedBindingId").asString
        )
        assertEquals(7L, body.get("expectedRevision").asLong)
        assertEquals(
            session.registrationId,
            body.get("registrationId").asString
        )

        assertEquals(
            api.returnedBindingId,
            requireNotNull(store.getConfirmed(session)).bindingId
        )
        assertNull(store.getPending(session))
    }

    @Test
    fun timeoutRetryKeepsExactBodyWithoutAnotherGet() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val session = login(manager, "a")
        val identity = identity()
        val api = FakeDeviceApi(identity.installationId).apply {
            failNextPut = true
        }
        val store = NotificationBindingStore(manager)

        val firstCoordinator = NotificationBindingCoordinator(
            manager, store, NotificationDeviceRepository(api)
        )

        assertTrue(
            firstCoordinator.synchronize(
                session, identity, null, "denied"
            ).isFailure
        )
        assertTrue(store.getPending(session) != null)

        val reopenedCoordinator = NotificationBindingCoordinator(
            manager,
            NotificationBindingStore(manager),
            NotificationDeviceRepository(api)
        )

        assertTrue(
            reopenedCoordinator.synchronize(
                session, identity, null, "denied"
            ).isSuccess
        )

        assertEquals(1, api.getCalls)
        assertEquals(2, api.sentBodies.size)
        assertEquals(api.sentBodies[0], api.sentBodies[1])
        assertNull(store.getPending(session))
    }

    @Test
    fun accountChangeDuringGetPreventsPut() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val accountA = login(manager, "a")
        val identity = identity()
        val api = FakeDeviceApi(identity.installationId)

        var accountB: AuthenticatedSessionSnapshot? = null
        api.onGet = {
            manager.clearSession(
                expectedGeneration = accountA.generation
            )
            accountB = login(manager, "b")
        }

        val store = NotificationBindingStore(manager)
        val coordinator = NotificationBindingCoordinator(
            manager, store, NotificationDeviceRepository(api)
        )

        val result = coordinator.synchronize(
            accountA, identity, null, "denied"
        )

        assertTrue(
            result.exceptionOrNull() is
                    ObsoleteNotificationSessionException
        )
        assertEquals(0, api.sentBodies.size)
        assertTrue(manager.isCurrentSession(requireNotNull(accountB)))
        assertNull(store.getConfirmed(requireNotNull(accountB)))
        assertNull(store.getPending(requireNotNull(accountB)))
    }

    @Test
    fun logoutClearsLocalSessionBeforeDeletingCapturedBinding() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val accountA = login(manager, "a")
        val identity = identity()
        val api = FakeDeviceApi(identity.installationId)
        val store = NotificationBindingStore(manager)
        val coordinator = NotificationBindingCoordinator(
            manager, store, NotificationDeviceRepository(api)
        )

        assertTrue(
            coordinator.synchronize(
                accountA, identity, null, "denied"
            ).isSuccess
        )

        var accountB: AuthenticatedSessionSnapshot? = null
        api.onDelete = {
            assertTrue(!manager.isLoggedIn())
            accountB = login(manager, "b")
        }

        val result = coordinator.logout(accountA, identity)

        assertTrue(result.isSuccess)
        assertEquals(
            NotificationRemoteLogoutStatus.UNBOUND,
            result.getOrThrow().remoteStatus
        )
        assertEquals(1, api.deleteCalls)
        assertEquals(api.returnedBindingId, api.deletedBindingId)
        assertEquals("Bearer test-token-a", api.deleteAuthorization)
        assertTrue(manager.isCurrentSession(requireNotNull(accountB)))
        assertNull(store.getConfirmed(requireNotNull(accountB)))
    }

    @Test
    fun staleLogoutDoesNotDeleteOrClearNewAccount() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val accountA = login(manager, "a")
        val accountB = login(manager, "b")
        val identity = identity()
        val api = FakeDeviceApi(identity.installationId)

        val coordinator = NotificationBindingCoordinator(
            manager,
            NotificationBindingStore(manager),
            NotificationDeviceRepository(api)
        )

        val result = coordinator.logout(accountA, identity)

        assertTrue(
            result.exceptionOrNull() is
                    ObsoleteNotificationSessionException
        )
        assertEquals(0, api.deleteCalls)
        assertTrue(manager.isCurrentSession(accountB))
    }

    @Test
    fun tokenConflictBlocksAutomaticResubmission() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val session = login(manager, "a")
        val identity = identity()
        val api = FakeDeviceApi(identity.installationId).apply {
            rejectPutWithConflict = true
        }
        val store = NotificationBindingStore(manager)
        val coordinator = NotificationBindingCoordinator(
            manager, store, NotificationDeviceRepository(api)
        )

        assertTrue(
            coordinator.synchronize(
                session, identity, null, "denied"
            ).isFailure
        )

        val reopened = NotificationBindingCoordinator(
            manager,
            NotificationBindingStore(manager),
            NotificationDeviceRepository(api)
        )

        assertTrue(
            reopened.synchronize(
                session, identity, null, "denied"
            ).isFailure
        )

        assertEquals(1, api.getCalls)
        assertEquals(1, api.sentBodies.size)
        assertEquals(
            "DEVICE_TOKEN_CONFLICT",
            requireNotNull(store.getBlockingFailure(session)).errorCode
        )
    }

    @Test
    fun rateLimitWaitsWithoutMakingAnotherRequest() = runBlocking {
        val manager = manager()
        manager.clearSession()
        val session = login(manager, "a")
        val identity = identity()
        val api = FakeDeviceApi(identity.installationId)
        val store = NotificationBindingStore(manager)

        store.recordRegistrationFailure(
            session = session,
            httpStatus = 429,
            errorCode = "RATE_LIMITED",
            retryAfterMillis = 120_000L
        )

        val coordinator = NotificationBindingCoordinator(
            manager, store, NotificationDeviceRepository(api)
        )

        val result = coordinator.synchronize(
            session, identity, null, "denied"
        )

        assertTrue(
            result.exceptionOrNull() is
                    NotificationBindingRetryDeferredException
        )
        assertEquals(0, api.getCalls)
        assertEquals(0, api.sentBodies.size)
    }

    @Test
    fun lateWorkerCannotPostAfterLogoutCancellationAndNewAccountSurvives() =
        runBlocking {
            val manager = manager()
            manager.clearSession()

            val accountA = login(manager, "logout-race-a")
            val identity = identity()
            val api = FakeDeviceApi(identity.installationId)
            val bindings = NotificationBindingStore(manager)
            val coordinator = NotificationBindingCoordinator(
                manager,
                bindings,
                NotificationDeviceRepository(api)
            )

            assertTrue(
                coordinator.synchronize(
                    accountA, identity, null, "denied"
                ).isSuccess
            )

            val binding = requireNotNull(bindings.getConfirmed(accountA))
            val receiptStore = FloodWarningPushReceiptStore(manager)

            val push = FloodWarningV2Push.parse(
                mapOf(
                    "schemaVersion" to "2",
                    "eventId" to UUID.randomUUID().toString(),
                    "alertId" to "logout-race-alert",
                    "kind" to "general",
                    "title" to "TEST ONLY",
                    "body" to "Logout race regression",
                    "createdAt" to "2026-11-25T13:00:00Z",
                    "installationId" to binding.installationId,
                    "bindingId" to binding.bindingId
                )
            ).getOrThrow()

            // Worker đã claim khi tài khoản A còn hợp lệ.
            assertEquals(
                FloodWarningPushDecision.CLAIMED,
                receiptStore.claimForDisplay(accountA, push)
            )

            var cancellationCount = 0
            var postCount = 0
            var latePost: Deferred<Boolean>? = null
            var accountB: AuthenticatedSessionSnapshot? = null

            api.onDelete = {
                // Hủy local phải xảy ra trước request DELETE.
                assertEquals(1, cancellationCount)
                assertFalse(manager.isCurrentSession(accountA))

                assertFalse(requireNotNull(latePost).await())
                assertEquals(0, postCount)

                // Phiên mới xuất hiện trong khi logout cũ còn chờ Backend.
                accountB = login(manager, "logout-race-b")
            }

            val result = coordinator.logout(
                session = accountA,
                identity = identity,
                onLocalSessionEnded = {
                    cancellationCount++

                    // Worker tới bước post ngay sau khi hủy thông báo.
                    latePost = async(start = CoroutineStart.UNDISPATCHED) {
                        receiptStore.postClaimedIfCurrent(
                            session = accountA,
                            push = push,
                            canPost = { true },
                            post = {
                                postCount++
                                true
                            }
                        )
                    }
                }
            )

            assertTrue(result.isSuccess)
            assertEquals(1, cancellationCount)
            assertEquals(0, postCount)
            assertTrue(manager.isCurrentSession(requireNotNull(accountB)))

            // Logout phiên cũ không được gọi lại callback hủy.
            var staleCancellation = false
            val staleResult = coordinator.logout(
                accountA,
                identity,
                onLocalSessionEnded = {
                    staleCancellation = true
                }
            )

            assertTrue(
                staleResult.exceptionOrNull() is
                        ObsoleteNotificationSessionException
            )
            assertFalse(staleCancellation)
            assertTrue(manager.isCurrentSession(requireNotNull(accountB)))
        }

    private class FakeDeviceApi(
        private val installationId: String
    ) : NotificationDeviceApi {

        var readBindingId: String? = null
        var readRevision = 0L
        val returnedBindingId = UUID.randomUUID().toString()

        var getCalls = 0
        var failNextPut = false
        var onGet: suspend () -> Unit = {}
        val sentBodies = mutableListOf<JsonObject>()
        var deleteCalls = 0
        var deletedBindingId: String? = null
        var deleteAuthorization: String? = null
        var onDelete: suspend () -> Unit = {}
        var rejectPutWithConflict = false

        override suspend fun getInstallation(
            installationId: String,
            authorization: String,
            installationSecret: String
        ): Response<JsonObject> {
            getCalls++
            onGet()

            return success(
                "installation",
                JsonObject().apply {
                    addProperty("installationId", installationId)
                    addProperty("bindingId", readBindingId)
                    addProperty("revision", readRevision)
                    addProperty("active", readBindingId != null)
                    addProperty(
                        "boundToCurrentAccount",
                        readBindingId != null
                    )
                }
            )
        }

        override suspend fun registerInstallation(
            installationId: String,
            authorization: String,
            installationSecret: String,
            body: JsonObject
        ): Response<JsonObject> {
            sentBodies.add(body.deepCopy())

            if (rejectPutWithConflict) {
                return Response.error<JsonObject>(
                    409,
                    """
                    {
                      "success": false,
                      "code": "DEVICE_TOKEN_CONFLICT"
                    }
                    """.trimIndent().toResponseBody(
                        "application/json".toMediaType()
                    )
                )
            }

            if (failNextPut) {
                failNextPut = false
                throw IOException("TEST ONLY - response lost")
            }

            return success(
                "device",
                JsonObject().apply {
                    addProperty("installationId", installationId)
                    addProperty("bindingId", returnedBindingId)
                    addProperty("revision", readRevision + 1)
                    addProperty("platform", "android")
                    addProperty(
                        "notificationPermission",
                        body.get("notificationPermission").asString
                    )
                    addProperty("pushEligible", false)
                }
            )
        }

        override suspend fun deleteInstallation(
            installationId: String,
            authorization: String,
            installationSecret: String,
            installationIdHeader: String,
            bindingId: String
        ): Response<JsonObject> {
            deleteCalls++
            deletedBindingId = bindingId
            deleteAuthorization = authorization
            onDelete()
            return Response.success(
                JsonObject().apply {
                    addProperty("success", true)
                    add(
                        "data",
                        JsonObject().apply {
                            addProperty("installationId", installationId)
                            addProperty("bindingId", bindingId)
                            addProperty("unbound", true)
                        }
                    )
                }
            )
        }

        private fun success(
            key: String,
            value: JsonObject
        ): Response<JsonObject> =
            Response.success(
                JsonObject().apply {
                    addProperty("success", true)
                    add(
                        "data",
                        JsonObject().apply {
                            add(key, value)
                        }
                    )
                }
            )
    }
}