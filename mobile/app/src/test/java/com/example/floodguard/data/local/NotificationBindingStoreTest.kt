package com.example.floodguard.data.local

import com.example.floodguard.data.remote.api.NotificationDeviceRegistration
import com.example.floodguard.data.repository.ConfirmedNotificationDevice
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class NotificationBindingStoreTest {

    private fun manager() =
        SessionManager(RuntimeEnvironment.getApplication())

    private suspend fun login(
        session: SessionManager,
        account: String
    ): AuthenticatedSessionSnapshot {
        assertTrue(
            session.saveAuthenticatedSession(
                token = "test-token-$account",
                user = SessionUser(id = account, role = "resident"),
                expectedGeneration = session.getGeneration()
            )
        )
        return requireNotNull(session.getSessionSnapshot())
    }

    private fun registration(
        session: AuthenticatedSessionSnapshot,
        bindingId: String? = null,
        revision: Long = 0
    ) = NotificationDeviceRegistration(
        fcmToken = null,
        notificationPermission = "denied",
        registrationId = session.registrationId,
        expectedBindingId = bindingId,
        expectedRevision = revision
    )

    @Test
    fun pendingBodySurvivesReopeningStore() = runBlocking {
        val session = manager()
        session.clearSession()
        val snapshot = login(session, "a")
        val installationId = UUID.randomUUID().toString()
        val request = registration(snapshot)

        assertTrue(
            NotificationBindingStore(session).savePending(
                snapshot, installationId, request
            )
        )

        val pending = requireNotNull(
            NotificationBindingStore(manager()).getPending(snapshot)
        )

        assertEquals(installationId, pending.installationId)
        assertEquals(request.toJson(), pending.registration.toJson())
        assertTrue(pending.registration.toJson().get("fcmToken").isJsonNull)
    }

    @Test
    fun sameBindingKeepsSequenceAfterDeviceUpdate() = runBlocking {
        val session = manager()
        session.clearSession()
        val snapshot = login(session, "a")
        val store = NotificationBindingStore(session)
        val installationId = UUID.randomUUID().toString()
        val bindingId = UUID.randomUUID().toString()

        val first = registration(snapshot)
        assertTrue(store.savePending(snapshot, installationId, first))
        assertTrue(
            store.confirm(
                snapshot, installationId, first,
                ConfirmedNotificationDevice(
                    installationId, bindingId, 1, "denied", false
                )
            )
        )

        assertEquals(
            1L,
            store.nextLocationSequence(snapshot, installationId, bindingId)
        )

        val update = registration(snapshot, bindingId, 1)
        assertTrue(store.savePending(snapshot, installationId, update))
        assertTrue(
            store.confirm(
                snapshot, installationId, update,
                ConfirmedNotificationDevice(
                    installationId, bindingId, 2, "denied", false
                )
            )
        )

        val reopened = NotificationBindingStore(manager())
        assertEquals(
            2L,
            reopened.nextLocationSequence(snapshot, installationId, bindingId)
        )
        assertNull(reopened.getPending(snapshot))
    }

    @Test
    fun oldSessionCannotConfirmOrOverwriteNewPendingBody() = runBlocking {
        val session = manager()
        session.clearSession()
        val accountA = login(session, "a")
        val store = NotificationBindingStore(session)
        val installationId = UUID.randomUUID().toString()
        val requestA = registration(accountA)

        assertTrue(store.savePending(accountA, installationId, requestA))

        val accountB = login(session, "b")
        val requestB = registration(accountB)
        assertTrue(store.savePending(accountB, installationId, requestB))

        assertFalse(
            store.confirm(
                accountA, installationId, requestA,
                ConfirmedNotificationDevice(
                    installationId,
                    UUID.randomUUID().toString(),
                    1,
                    "denied",
                    false
                )
            )
        )

        val pendingB = requireNotNull(store.getPending(accountB))
        assertEquals(requestB.toJson(), pendingB.registration.toJson())
        assertNull(store.getConfirmed(accountB))
    }
}