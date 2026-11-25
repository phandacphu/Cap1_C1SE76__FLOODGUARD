package com.example.floodguard.data.remote.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class NotificationDeviceRegistrationTest {

    @Test
    fun firstRegistrationKeepsAllSixFieldsIncludingNulls() {
        val body = NotificationDeviceRegistration(
            fcmToken = null,
            notificationPermission = "denied",
            registrationId = UUID.randomUUID().toString(),
            expectedBindingId = null,
            expectedRevision = 0
        ).toJson()

        assertEquals(
            setOf(
                "platform",
                "fcmToken",
                "notificationPermission",
                "registrationId",
                "expectedBindingId",
                "expectedRevision"
            ),
            body.entrySet().map { it.key }.toSet()
        )
        assertTrue(body.get("fcmToken").isJsonNull)
        assertTrue(body.get("expectedBindingId").isJsonNull)
        assertEquals("android", body.get("platform").asString)
    }

    @Test
    fun tokenUpdatePreservesRegistrationAndConfirmedBinding() {
        val registrationId = UUID.randomUUID().toString()
        val bindingId = UUID.randomUUID().toString()

        val request = NotificationDeviceRegistration(
            fcmToken = "test-token",
            notificationPermission = "granted",
            registrationId = registrationId,
            expectedBindingId = bindingId,
            expectedRevision = 7
        )

        val first = request.toJson()
        val retry = request.toJson()

        assertEquals(first, retry)
        assertEquals(
            registrationId,
            first.get("registrationId").asString
        )
        assertEquals(bindingId, first.get("expectedBindingId").asString)
        assertEquals(7L, first.get("expectedRevision").asLong)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsMissingBindingWithNonzeroRevision() {
        NotificationDeviceRegistration(
            fcmToken = null,
            notificationPermission = "unknown",
            registrationId = UUID.randomUUID().toString(),
            expectedBindingId = null,
            expectedRevision = 7
        ).toJson()
    }
}