package com.example.floodguard.core.notifications

import androidx.work.Data
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionUser
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class FloodWarningPushWorkEnvelopeTest {
    private val registration = UUID.randomUUID().toString()

    private fun session(
        generation: Long = 5,
        account: String = "test-account-a",
        registrationId: String = registration
    ) = AuthenticatedSessionSnapshot(
        generation = generation,
        registrationId = registrationId,
        user = SessionUser(id = account, role = "resident"),
        accessToken = "test-jwt-never-persist"
    )

    private fun binding() = SavedNotificationBinding(
        installationId = "test-installation",
        bindingId = "test-binding",
        revision = 5,
        sequence = 7
    )

    private fun push() = FloodWarningV2Push.parse(
        mapOf(
            "schemaVersion" to "2",
            "eventId" to "test-event",
            "alertId" to "test-alert",
            "kind" to "near",
            "title" to "Kiểm thử",
            "body" to "Nội dung kiểm thử.",
            "createdAt" to "2026-11-24T09:00:00Z",
            "installationId" to "test-installation",
            "bindingId" to "test-binding"
        )
    ).getOrThrow()

    private fun restored(): FloodWarningPushWorkEnvelope =
        FloodWarningPushWorkEnvelope.fromWorkData(
            FloodWarningPushWorkEnvelope.capture(
                session(), binding(), push()
            ).toWorkData()
        ).getOrThrow()

    @Test
    fun restoresPayloadAndMatchesSameSession() {
        val envelope = restored()

        assertTrue(envelope.matches(session(), binding()))
        assertEquals(5L, envelope.generation)
        assertEquals("test-event", envelope.push.eventId)
        assertEquals("test-alert", envelope.push.alertId)
    }

    @Test
    fun rejectsChangedAccountGenerationRegistrationAndBinding() {
        val envelope = restored()

        assertFalse(
            envelope.matches(session(account = "account-b"), binding())
        )
        assertFalse(
            envelope.matches(session(generation = 7), binding())
        )
        assertFalse(
            envelope.matches(
                session(registrationId = UUID.randomUUID().toString()),
                binding()
            )
        )
        assertFalse(
            envelope.matches(
                session(),
                binding().copy(bindingId = "new-binding")
            )
        )
        assertFalse(envelope.matches(null, binding()))
        assertFalse(envelope.matches(session(), null))
    }

    @Test
    fun sameBindingRevisionAndSequenceUpdatesDoNotChangeSession() {
        assertTrue(
            restored().matches(
                session(),
                binding().copy(revision = 6, sequence = 20)
            )
        )
    }

    @Test
    fun workDataDoesNotContainJwtOrRawAccountId() {
        val data = FloodWarningPushWorkEnvelope.capture(
            session(), binding(), push()
        ).toWorkData()

        val persisted = data.keyValueMap.values.joinToString()

        assertFalse(persisted.contains("test-jwt-never-persist"))
        assertFalse(persisted.contains("test-account-a"))
    }

    @Test
    fun rejectsMissingAndMalformedWorkData() {
        assertTrue(
            FloodWarningPushWorkEnvelope.fromWorkData(
                Data.Builder().build()
            ).isFailure
        )

        assertTrue(
            FloodWarningPushWorkEnvelope.fromWorkData(
                Data.Builder()
                    .putLong("warning_v2_generation", 5)
                    .putString("warning_v2_registration", registration)
                    .putString("warning_v2_account", "test-hash")
                    .putString("warning_v2_payload", """{"kind":123}""")
                    .build()
            ).isFailure
        )
    }
}