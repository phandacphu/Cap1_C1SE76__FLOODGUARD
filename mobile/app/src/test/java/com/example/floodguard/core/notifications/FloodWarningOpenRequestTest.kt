package com.example.floodguard.core.notifications

import android.content.Intent
import android.net.Uri
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionUser
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class FloodWarningOpenRequestTest {
    private val registration = UUID.randomUUID().toString()

    private fun session(
        generation: Long = 5,
        registrationId: String = registration,
        role: String = "resident"
    ) = AuthenticatedSessionSnapshot(
        generation = generation,
        registrationId = registrationId,
        user = SessionUser(id = "test-account", role = role),
        accessToken = "test-token"
    )

    private fun binding() = SavedNotificationBinding(
        "test-installation",
        "test-binding",
        5,
        10
    )

    private fun uri(
        alertId: String = "test-alert",
        kind: String = "general"
    ): Uri = Uri.Builder()
        .scheme("floodguard")
        .authority("warning")
        .appendPath(alertId)
        .appendQueryParameter("generation", "5")
        .appendQueryParameter("registration", registration)
        .appendQueryParameter("kind", kind)
        .build()

    private fun intent(): Intent =
        Intent(FloodWarningLocalNotifications.OPEN_ACTION)
            .setData(uri())
            .putExtra(
                FloodWarningLocalNotifications.EXTRA_ALERT_ID,
                "test-alert"
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
    fun opensExactIdOnlyForMatchingSessionAndBinding() {
        val request = requireNotNull(
            FloodWarningOpenRequest.parse(intent())
        )

        assertEquals("test-alert", request.alertId)
        assertTrue(request.matches(session(), binding()))

        // Cập nhật token/GPS trong cùng binding không đổi phiên mở.
        assertTrue(
            request.matches(
                session(),
                binding().copy(revision = 6, sequence = 20)
            )
        )
    }

    @Test
    fun rejectsOldGenerationRegistrationBindingAndRescueRole() {
        val request = requireNotNull(
            FloodWarningOpenRequest.parse(intent())
        )

        assertFalse(
            request.matches(session(generation = 7), binding())
        )
        assertFalse(
            request.matches(
                session(registrationId = UUID.randomUUID().toString()),
                binding()
            )
        )
        assertFalse(
            request.matches(
                session(),
                binding().copy(bindingId = "new-binding")
            )
        )
        assertFalse(
            request.matches(session(role = "rescue"), binding())
        )
        assertFalse(request.matches(null, binding()))
    }

    @Test
    fun rejectsMissingMetadataAndDifferentIds() {
        assertNull(
            FloodWarningOpenRequest.parse(
                intent().apply {
                    removeExtra(
                        FloodWarningLocalNotifications.EXTRA_BINDING
                    )
                }
            )
        )

        assertNull(
            FloodWarningOpenRequest.parse(
                intent().setData(uri(alertId = "another-alert"))
            )
        )
    }

    @Test
    fun rejectsLauncherAndDeactivationOpenRequests() {
        assertNull(
            FloodWarningOpenRequest.parse(
                intent().setAction(Intent.ACTION_MAIN)
            )
        )
        assertNull(
            FloodWarningOpenRequest.parse(
                intent().setData(uri(kind = "deactivated"))
            )
        )
    }
}