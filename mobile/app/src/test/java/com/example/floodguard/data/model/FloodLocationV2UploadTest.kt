package com.example.floodguard.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class FloodLocationV2UploadTest {

    // Chỉ là dữ liệu unit test, không gửi tới API thật.
    private fun fix(accuracyM: Double? = 20.0) =
        FloodLocationV2Fix(
            latitude = 16.0544,
            longitude = 108.2022,
            capturedAtEpochMillis = Instant.parse(
                "2026-11-24T09:00:00.123Z"
            ).toEpochMilli(),
            accuracyM = accuracyM
        )

    @Test
    fun availableBodyHasExactlySixFieldsAndOriginalCaptureTime() {
        val body = FloodLocationV2Upload.available(1, fix()).toJson()

        assertEquals(
            setOf(
                "sequence",
                "availability",
                "reason",
                "location",
                "capturedAt",
                "accuracyM"
            ),
            body.entrySet().map { it.key }.toSet()
        )
        assertEquals("available", body.get("availability").asString)
        assertTrue(body.get("reason").isJsonNull)
        assertEquals(
            "2026-11-24T09:00:00.123Z",
            body.get("capturedAt").asString
        )
    }

    @Test
    fun allUnavailableReasonsClearEveryLocationField() {
        FloodLocationUnavailableReason.values().forEach { reason ->
            val body = FloodLocationV2Upload.unavailable(
                sequence = 2,
                reason = reason
            ).toJson()

            assertEquals(6, body.entrySet().size)
            assertEquals("unavailable", body.get("availability").asString)
            assertEquals(reason.wireValue, body.get("reason").asString)
            assertTrue(body.get("location").isJsonNull)
            assertTrue(body.get("capturedAt").isJsonNull)
            assertTrue(body.get("accuracyM").isJsonNull)
        }
    }

    @Test
    fun missingAccuracyStaysNull() {
        val body = FloodLocationV2Upload.available(
            1, fix(accuracyM = null)
        ).toJson()

        assertTrue(body.get("accuracyM").isJsonNull)
    }

    @Test
    fun poorAccuracyIsNotChangedIntoPreciseLocation() {
        val body = FloodLocationV2Upload.available(
            1, fix(accuracyM = 150.0)
        ).toJson()

        assertEquals(150.0, body.get("accuracyM").asDouble, 0.0)
    }

    @Test
    fun retryKeepsSequenceAndBodyEvenIfReturnedJsonWasModified() {
        val upload = FloodLocationV2Upload.available(7, fix())
        val original = upload.toJson()

        val externalCopy = upload.toJson()
        externalCopy.addProperty("sequence", 999)

        assertEquals(original, upload.toJson())
        assertEquals(7L, upload.toJson().get("sequence").asLong)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsInvalidCoordinates() {
        fix().copy(latitude = Double.NaN)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsZeroSequence() {
        FloodLocationV2Upload.available(0, fix())
    }
}