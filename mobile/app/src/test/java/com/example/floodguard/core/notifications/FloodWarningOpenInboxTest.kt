package com.example.floodguard.core.notifications

import android.content.Intent
import android.net.Uri
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class FloodWarningOpenInboxTest {
    private val registration = UUID.randomUUID().toString()

    @Before
    fun clearInbox() {
        FloodWarningOpenInbox.pending.value?.let {
            FloodWarningOpenInbox.consume(it)
        }
    }

    private fun intent(alertId: String): Intent =
        Intent(FloodWarningLocalNotifications.OPEN_ACTION)
            .setData(
                Uri.Builder()
                    .scheme("floodguard")
                    .authority("warning")
                    .appendPath(alertId)
                    .appendQueryParameter("generation", "5")
                    .appendQueryParameter("registration", registration)
                    .appendQueryParameter("kind", "general")
                    .build()
            )
            .putExtra(
                FloodWarningLocalNotifications.EXTRA_ALERT_ID,
                alertId
            )
            .putExtra(
                FloodWarningLocalNotifications.EXTRA_GENERATION,
                5L
            )
            .putExtra(
                FloodWarningLocalNotifications.EXTRA_REGISTRATION,
                registration
            )
            .putExtra(
                FloodWarningLocalNotifications.EXTRA_INSTALLATION,
                "test-installation"
            )
            .putExtra(
                FloodWarningLocalNotifications.EXTRA_BINDING,
                "test-binding"
            )

    @Test
    fun finishingOldRequestCannotDeleteNewRequest() {
        assertTrue(FloodWarningOpenInbox.offer(intent("alert-a")))
        val old = requireNotNull(FloodWarningOpenInbox.pending.value)

        assertTrue(FloodWarningOpenInbox.offer(intent("alert-b")))

        assertFalse(FloodWarningOpenInbox.consume(old))
        assertEquals(
            "alert-b",
            FloodWarningOpenInbox.pending.value?.request?.alertId
        )
    }

    @Test
    fun savesOnlyWhitelistedMetadataAndCanRestore() {
        val original = intent("alert-a")
            .putExtra("unexpected_token", "must-not-be-saved")

        assertTrue(FloodWarningOpenInbox.offer(original))

        val saved = requireNotNull(
            FloodWarningOpenInbox.intentForSave()
        )

        assertFalse(saved.hasExtra("unexpected_token"))

        val current = requireNotNull(
            FloodWarningOpenInbox.pending.value
        )
        assertTrue(FloodWarningOpenInbox.consume(current))
        assertNull(FloodWarningOpenInbox.intentForSave())

        assertTrue(FloodWarningOpenInbox.offer(saved))
        assertEquals(
            "alert-a",
            FloodWarningOpenInbox.pending.value?.request?.alertId
        )
    }

    @Test
    fun logoutDiscardsOnlyItsOwnGeneration() {
        FloodWarningOpenInbox.offer(intent("alert-a"))

        FloodWarningOpenInbox.discardGeneration(7)
        assertEquals(
            "alert-a",
            FloodWarningOpenInbox.pending.value?.request?.alertId
        )

        FloodWarningOpenInbox.discardGeneration(5)
        assertNull(FloodWarningOpenInbox.pending.value)
    }
}