package com.example.floodguard.core.notifications

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FloodWarningV2PushTest {
    private fun payload(kind: String = "general") = mapOf(
        "schemaVersion" to "2",
        "eventId" to "test-event-001",
        "alertId" to "test-alert-001",
        "kind" to kind,
        "title" to "Bản tin kiểm thử",
        "body" to "Nội dung kiểm thử FCM V2.",
        "createdAt" to "2026-11-24T13:00:00.000Z",
        "installationId" to "test-installation",
        "bindingId" to "test-binding"
    )

    @Test
    fun generalDoesNotRequireGpsEvaluation() {
        val push = FloodWarningV2Push.parse(payload()).getOrThrow()

        assertEquals("test-alert-001", push.alertId)
        assertEquals("test-event-001", push.eventId)
        assertEquals(
            FloodWarningV2PushKind.GENERAL,
            push.kind
        )
        assertFalse(push.requiresLocationEvaluation)
        assertFalse(push.isDeactivation)
    }

    @Test
    fun nearAndInsideRequireCurrentEvaluation() {
        listOf("near", "inside").forEach { kind ->
            val push = FloodWarningV2Push.parse(
                payload(kind)
            ).getOrThrow()

            assertTrue(push.requiresLocationEvaluation)
            assertFalse(push.isDeactivation)
        }
    }

    @Test
    fun deactivatedIsControlEvenWithEmptyDisplayText() {
        val push = FloodWarningV2Push.parse(
            payload("deactivated") + mapOf(
                "title" to "",
                "body" to ""
            )
        ).getOrThrow()

        assertTrue(push.isDeactivation)
        assertFalse(push.requiresLocationEvaluation)
    }

    @Test
    fun rejectsEveryMissingRequiredField() {
        payload().keys.forEach { key ->
            assertTrue(
                "Phải từ chối khi thiếu $key",
                FloodWarningV2Push.parse(payload() - key).isFailure
            )
        }
    }

    @Test
    fun rejectsWrongSchemaUnknownKindAndBlankIdentity() {
        listOf(
            mapOf("schemaVersion" to "1"),
            mapOf("kind" to "warning"),
            mapOf("eventId" to ""),
            mapOf("alertId" to " "),
            mapOf("installationId" to ""),
            mapOf("bindingId" to "")
        ).forEach { change ->
            assertTrue(
                FloodWarningV2Push.parse(
                    payload() + change
                ).isFailure
            )
        }
    }

    @Test
    fun validatesUtf8BytesInsteadOfCharacterCount() {
        // Mỗi ký tự này chiếm 3 byte UTF-8.
        assertTrue(
            FloodWarningV2Push.parse(
                payload() + ("title" to "ắ".repeat(201))
            ).isFailure
        )

        assertTrue(
            FloodWarningV2Push.parse(
                payload() + ("body" to "ắ".repeat(667))
            ).isFailure
        )
    }

    @Test
    fun rejectsInvalidTimeButDoesNotTreatPushTimeAsGpsTime() {
        assertTrue(
            FloodWarningV2Push.parse(
                payload() + ("createdAt" to "not-a-time")
            ).isFailure
        )

        val oldPush = FloodWarningV2Push.parse(
            payload("near") +
                    ("createdAt" to "2020-01-01T00:00:00Z")
        ).getOrThrow()

        assertEquals(
            Instant.parse("2020-01-01T00:00:00Z"),
            oldPush.createdAt
        )
        assertTrue(oldPush.requiresLocationEvaluation)
    }

    @Test
    fun rejectsOversizedDataIncludingExtraFields() {
        assertTrue(
            FloodWarningV2Push.parse(
                payload() + ("extra" to "x".repeat(3500))
            ).isFailure
        )
    }
}