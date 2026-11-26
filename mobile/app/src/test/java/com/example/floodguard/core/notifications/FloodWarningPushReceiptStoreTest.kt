package com.example.floodguard.core.notifications

import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.remote.api.NotificationDeviceRegistration
import com.example.floodguard.data.repository.ConfirmedNotificationDevice
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class FloodWarningPushReceiptStoreTest {
    private fun manager() =
        SessionManager(RuntimeEnvironment.getApplication())

    private data class Fixture(
        val session: AuthenticatedSessionSnapshot,
        val binding: SavedNotificationBinding
    )

    private suspend fun loginAndBind(
        manager: SessionManager,
        accountId: String,
        installationId: String
    ): Fixture {
        check(
            manager.saveAuthenticatedSession(
                token = "test-token-$accountId",
                user = SessionUser(id = accountId, role = "resident"),
                expectedGeneration = manager.getGeneration()
            )
        )

        val session = requireNotNull(manager.getSessionSnapshot())
        val store = NotificationBindingStore(manager)

        val request = NotificationDeviceRegistration(
            fcmToken = null,
            notificationPermission = "denied",
            registrationId = session.registrationId,
            expectedBindingId = null,
            expectedRevision = 0
        )

        check(store.savePending(session, installationId, request))
        check(
            store.confirm(
                session,
                installationId,
                request,
                ConfirmedNotificationDevice(
                    installationId,
                    UUID.randomUUID().toString(),
                    1,
                    "denied",
                    false
                )
            )
        )

        return Fixture(
            session,
            requireNotNull(store.getConfirmed(session))
        )
    }

    private fun push(
        fixture: Fixture,
        eventId: String,
        kind: String = "general",
        bindingId: String = fixture.binding.bindingId
    ): FloodWarningV2Push =
        FloodWarningV2Push.parse(
            mapOf(
                "schemaVersion" to "2",
                "eventId" to eventId,
                "alertId" to "test-alert",
                "kind" to kind,
                "title" to "Kiểm thử",
                "body" to "Nội dung kiểm thử.",
                "createdAt" to "2026-11-24T13:00:00Z",
                "installationId" to fixture.binding.installationId,
                "bindingId" to bindingId
            )
        ).getOrThrow()

    @Test
    fun dedupeSurvivesReopeningAndReloginButIsAccountScoped() = runBlocking {
        val manager = manager()
        manager.clearSession()

        val accountA = UUID.randomUUID().toString()
        val installation = UUID.randomUUID().toString()
        val first = loginAndBind(manager, accountA, installation)

        assertEquals(
            FloodWarningPushDecision.CLAIMED,
            FloodWarningPushReceiptStore(manager).claimForDisplay(
                first.session, push(first, "same-event")
            )
        )

        assertTrue(manager.clearSession(first.session.generation))
        val relogin = loginAndBind(manager, accountA, installation)

        assertEquals(
            FloodWarningPushDecision.DUPLICATE,
            FloodWarningPushReceiptStore(manager()).claimForDisplay(
                relogin.session, push(relogin, "same-event")
            )
        )

        val accountB = loginAndBind(
            manager,
            UUID.randomUUID().toString(),
            installation
        )

        assertEquals(
            FloodWarningPushDecision.CLAIMED,
            FloodWarningPushReceiptStore(manager).claimForDisplay(
                accountB.session, push(accountB, "same-event")
            )
        )
    }

    @Test
    fun insideBlocksLaterNearAndDeactivationBlocksLatePush() = runBlocking {
        val manager = manager()
        manager.clearSession()

        val fixture = loginAndBind(
            manager,
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString()
        )
        val store = FloodWarningPushReceiptStore(manager)

        assertEquals(
            FloodWarningPushDecision.CLAIMED,
            store.claimForDisplay(
                fixture.session, push(fixture, "inside-event", "inside")
            )
        )

        assertEquals(
            FloodWarningPushDecision.NEAR_SUPPRESSED,
            FloodWarningPushReceiptStore(manager()).claimForDisplay(
                fixture.session, push(fixture, "near-event", "near")
            )
        )

        val control = push(fixture, "off-event", "deactivated")

        assertEquals(
            FloodWarningPushDecision.CONTROL_ONLY,
            store.claimForDisplay(fixture.session, control)
        )
        assertEquals(
            FloodWarningPushDecision.CONTROL_RECORDED,
            store.recordDeactivation(fixture.session, control)
        )
        assertEquals(
            FloodWarningPushDecision.ALERT_INACTIVE,
            store.claimForDisplay(
                fixture.session, push(fixture, "late-general")
            )
        )
    }

    @Test
    fun wrongBindingAndOldAccountCannotPoisonCurrentReceipts() = runBlocking {
        val manager = manager()
        manager.clearSession()

        val installation = UUID.randomUUID().toString()
        val accountA = loginAndBind(
            manager, UUID.randomUUID().toString(), installation
        )
        val store = FloodWarningPushReceiptStore(manager)

        assertEquals(
            FloodWarningPushDecision.WRONG_TARGET,
            store.claimForDisplay(
                accountA.session,
                push(accountA, "event", bindingId = "wrong-binding")
            )
        )

        val accountB = loginAndBind(
            manager, UUID.randomUUID().toString(), installation
        )

        assertEquals(
            FloodWarningPushDecision.OBSOLETE_SESSION,
            store.claimForDisplay(
                accountA.session, push(accountA, "event")
            )
        )

        assertEquals(
            FloodWarningPushDecision.CLAIMED,
            store.claimForDisplay(
                accountB.session, push(accountB, "event")
            )
        )
    }

    @Test
    fun concurrentDuplicateHasOnlyOneClaim() = runBlocking {
        val manager = manager()
        manager.clearSession()

        val fixture = loginAndBind(
            manager,
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString()
        )
        val event = push(fixture, "concurrent-event")
        val store = FloodWarningPushReceiptStore(manager)

        val decisions = List(8) {
            async {
                store.claimForDisplay(fixture.session, event)
            }
        }.awaitAll()

        assertEquals(
            1,
            decisions.count { it == FloodWarningPushDecision.CLAIMED }
        )
        assertEquals(
            7,
            decisions.count { it == FloodWarningPushDecision.DUPLICATE }
        )
    }

    @Test
    fun inactiveReadFromApiBlocksPushAfterReopeningStore() = runBlocking {
        val manager = manager()
        manager.clearSession()

        val fixture = loginAndBind(
            manager,
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString()
        )

        assertTrue(
            FloodWarningPushReceiptStore(manager)
                .recordInactiveFromApi(fixture.session, "test-alert")
        )

        assertEquals(
            FloodWarningPushDecision.ALERT_INACTIVE,
            FloodWarningPushReceiptStore(manager()).claimForDisplay(
                fixture.session, push(fixture, "late-event")
            )
        )
    }
    @Test
    fun postRequiresClaimAndCannotRunTwice() = runBlocking {
        val manager = manager()
        manager.clearSession()

        val fixture = loginAndBind(
            manager,
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString()
        )
        val event = push(fixture, "post-once")
        val store = FloodWarningPushReceiptStore(manager)
        var posts = 0

        val post: () -> Boolean = {
            posts++
            true
        }

        assertEquals(
            false,
            store.postClaimedIfCurrent(
                fixture.session,
                event,
                canPost = { true },
                post = post
            )
        )

        assertEquals(
            FloodWarningPushDecision.CLAIMED,
            store.claimForDisplay(fixture.session, event)
        )

        assertEquals(
            true,
            store.postClaimedIfCurrent(
                fixture.session,
                event,
                canPost = { true },
                post = post
            )
        )

        assertEquals(
            false,
            FloodWarningPushReceiptStore(manager())
                .postClaimedIfCurrent(
                    fixture.session,
                    event,
                    canPost = { true },
                    post = post
                )
        )

        assertEquals(1, posts)
    }

    @Test
    fun deactivationBetweenClaimAndPostCancelsDisplay() = runBlocking {
        val manager = manager()
        manager.clearSession()

        val fixture = loginAndBind(
            manager,
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString()
        )
        val store = FloodWarningPushReceiptStore(manager)
        val event = push(fixture, "pending-general")
        var posts = 0

        assertEquals(
            FloodWarningPushDecision.CLAIMED,
            store.claimForDisplay(fixture.session, event)
        )

        store.recordDeactivation(
            fixture.session,
            push(fixture, "off-control", "deactivated")
        )

        assertEquals(
            false,
            store.postClaimedIfCurrent(
                fixture.session,
                event,
                canPost = { true },
                post = {
                    posts++
                    true
                }
            )
        )

        assertEquals(0, posts)
    }

    @Test
    fun logoutBetweenClaimAndPostRejectsOldAccount() = runBlocking {
        val manager = manager()
        manager.clearSession()

        val installation = UUID.randomUUID().toString()
        val accountA = loginAndBind(
            manager,
            UUID.randomUUID().toString(),
            installation
        )
        val store = FloodWarningPushReceiptStore(manager)
        val event = push(accountA, "pending-a")
        var posts = 0

        assertEquals(
            FloodWarningPushDecision.CLAIMED,
            store.claimForDisplay(accountA.session, event)
        )

        manager.clearSession(accountA.session.generation)
        loginAndBind(
            manager,
            UUID.randomUUID().toString(),
            installation
        )

        assertEquals(
            false,
            store.postClaimedIfCurrent(
                accountA.session,
                event,
                canPost = { true },
                post = {
                    posts++
                    true
                }
            )
        )

        assertEquals(0, posts)
    }
}