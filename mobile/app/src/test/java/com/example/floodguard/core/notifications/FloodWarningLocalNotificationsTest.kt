package com.example.floodguard.core.notifications

import android.app.NotificationManager
import android.content.Context
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.repository.FloodWarningV2
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class FloodWarningLocalNotificationsTest {
    private fun context(): Context =
        RuntimeEnvironment.getApplication()

    private fun manager() =
        context().getSystemService(NotificationManager::class.java)

    private fun session(accountId: String) =
        AuthenticatedSessionSnapshot(
            generation = 5,
            registrationId = UUID.randomUUID().toString(),
            user = SessionUser(id = accountId, role = "resident"),
            accessToken = "test-jwt-not-in-intent"
        )

    private fun alert(id: String = "test-alert") =
        FloodWarningV2(
            id = id,
            title = "Tiêu đề mới từ API",
            content = "Nội dung mới từ API.",
            status = "active",
            scope = "all_published_zones",
            startAt = "2026-11-24T09:00:00Z",
            endAt = null,
            createdAt = "2026-11-24T09:00:00Z",
            updatedAt = "2026-11-24T09:00:00Z",
            revision = 1
        )

    private fun push(kind: String = "general") =
        FloodWarningV2Push.parse(
            mapOf(
                "schemaVersion" to "2",
                "eventId" to "test-event-$kind",
                "alertId" to "test-alert",
                "kind" to kind,
                "title" to "Tiêu đề cũ",
                "body" to "Nội dung cũ.",
                "createdAt" to "2026-11-24T09:00:00Z",
                "installationId" to "test-installation",
                "bindingId" to "test-binding"
            )
        ).getOrThrow()

    @Before
    fun clearNotifications() {
        manager().cancelAll()
    }

    @Test
    fun notificationCarriesExactAlertAndSessionWithoutJwt() {
        val session = session("account-a")
        val notifications = FloodWarningLocalNotifications(context())

        assertTrue(
            notifications.postVerified(session, push(), alert())
        )

        val posted = manager().activeNotifications.single()
        val notification = posted.notification
        val intent = shadowOf(notification.contentIntent).savedIntent

        assertEquals(
            FloodWarningLocalNotifications.CHANNEL_ID,
            notification.channelId
        )
        assertEquals(
            "Tiêu đề mới từ API",
            notification.extras
                .getCharSequence("android.title").toString()
        )
        assertEquals(
            "test-alert",
            intent.getStringExtra(
                FloodWarningLocalNotifications.EXTRA_ALERT_ID
            )
        )
        assertEquals(
            session.generation,
            intent.getLongExtra(
                FloodWarningLocalNotifications.EXTRA_GENERATION,
                -1
            )
        )
        assertEquals(
            session.registrationId,
            intent.getStringExtra(
                FloodWarningLocalNotifications.EXTRA_REGISTRATION
            )
        )
        assertFalse(
            intent.extras.toString().contains("test-jwt-not-in-intent")
        )
    }

    @Test
    fun cancellationDoesNotRemoveAnotherAccountsNotifications() {
        val notifications = FloodWarningLocalNotifications(context())
        val accountA = session("account-a")
        val accountB = session("account-b")

        assertTrue(
            notifications.postVerified(accountA, push(), alert())
        )
        assertTrue(
            notifications.postVerified(accountA, push("near"), alert())
        )
        assertTrue(
            notifications.postVerified(accountB, push(), alert())
        )

        assertEquals(3, manager().activeNotifications.size)

        notifications.cancelAlert(accountA, "test-alert")
        assertEquals(1, manager().activeNotifications.size)

        notifications.cancelAccount(accountB)
        assertEquals(0, manager().activeNotifications.size)
    }

    @Test
    fun controlInactiveAndWrongDetailAreNotPosted() {
        val notifications = FloodWarningLocalNotifications(context())
        val session = session("account-a")

        assertFalse(
            notifications.postVerified(
                session, push("deactivated"), alert()
            )
        )
        assertFalse(
            notifications.postVerified(
                session,
                push(),
                alert().copy(
                    status = "inactive",
                    endAt = "2026-11-24T09:01:00Z"
                )
            )
        )
        assertFalse(
            notifications.postVerified(
                session, push(), alert("another-alert")
            )
        )

        assertEquals(0, manager().activeNotifications.size)
    }
}