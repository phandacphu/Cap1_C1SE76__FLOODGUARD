package com.example.floodguard.core.notifications

internal object FloodLocationUploadTiming {
    private const val MIN_SAMPLE_AGE_NANOS = 2_000_000_000L

    fun delayMillis(
        capturedElapsedNanos: Long,
        nowElapsedNanos: Long
    ): Long {
        // Mẫu không hợp lệ sẽ bị toFix loại bỏ.
        if (
            capturedElapsedNanos <= 0L ||
            nowElapsedNanos < capturedElapsedNanos
        ) {
            return 0L
        }

        val ageNanos = nowElapsedNanos - capturedElapsedNanos
        val remainingNanos = MIN_SAMPLE_AGE_NANOS - ageNanos

        if (remainingNanos <= 0L) return 0L

        // Làm tròn lên để không gửi sớm hơn khoảng chờ.
        return (remainingNanos + 999_999L) / 1_000_000L
    }
}