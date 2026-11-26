package com.example.floodguard.core.notifications

import com.example.floodguard.data.model.FloodLocationV2Fix
import com.example.floodguard.data.model.FloodLocationV2Upload
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FloodLocationUploadTimingTest {
    @Test
    fun smallClockOffsetsPassStrictFutureCheckWithoutChangingCaptureTime() {
        val serverAtCapture = 1_800_000_000_000L
        val capturedElapsed = 10_000_000_000L

        for (offsetMs in listOf(-500L, 0L, 297L, 683L, 1_500L)) {
            val originalCapture = serverAtCapture + offsetMs

            // App nhận mẫu sau khi đo 140 ms.
            val ageAtReadMs = 140L
            val waitMs = FloodLocationUploadTiming.delayMillis(
                capturedElapsed,
                capturedElapsed + ageAtReadMs * 1_000_000L
            )

            // Mô phỏng không có thêm độ trễ mạng.
            val serverAtUpload = serverAtCapture + ageAtReadMs + waitMs

            val body = FloodLocationV2Upload.available(
                sequence = 1L,
                fix = FloodLocationV2Fix(
                    latitude = 10.0,
                    longitude = 106.0,
                    capturedAtEpochMillis = originalCapture,
                    accuracyM = 20.0
                )
            ).toJson()

            val actualCapture = Instant.parse(
                body.get("capturedAt").asString
            ).toEpochMilli()

            assertEquals(originalCapture, actualCapture)
            assertTrue(
                "Timestamp còn ở tương lai với offset=$offsetMs",
                actualCapture <= serverAtUpload
            )
            assertTrue(serverAtUpload - actualCapture <= 60_000L)
            assertEquals(1L, body.get("sequence").asLong)
        }
    }

    @Test
    fun sampleAlreadyTwoSecondsOldNeedsNoAdditionalWait() {
        assertEquals(
            0L,
            FloodLocationUploadTiming.delayMillis(
                10_000_000_000L,
                12_000_000_000L
            )
        )
    }

    @Test
    fun fractionalMillisecondWaitRoundsUp() {
        assertEquals(
            1L,
            FloodLocationUploadTiming.delayMillis(
                10_000_000_000L,
                11_999_500_000L
            )
        )
    }

    @Test
    fun largeClockOffsetIsNotHiddenByChangingTimestamp() {
        val waitMs = FloodLocationUploadTiming.delayMillis(
            10_000_000_000L,
            10_000_000_000L
        )

        assertEquals(2_000L, waitMs)

        // Lệch 5 giây vẫn vượt giới hạn của biện pháp này.
        assertTrue(5_000L > waitMs)
    }
}