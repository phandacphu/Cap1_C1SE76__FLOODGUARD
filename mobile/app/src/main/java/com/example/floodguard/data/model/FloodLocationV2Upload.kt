package com.example.floodguard.data.model

import com.google.gson.JsonNull
import com.google.gson.JsonObject
import java.time.Instant
import java.time.format.DateTimeFormatterBuilder

enum class FloodLocationUnavailableReason(val wireValue: String) {
    PERMISSION_DENIED("permission_denied"),
    LOCATION_DISABLED("location_disabled"),
    NO_FIX("no_fix")
}

data class FloodLocationV2Fix(
    val latitude: Double,
    val longitude: Double,
    val capturedAtEpochMillis: Long,
    val accuracyM: Double?
) {
    init {
        require(latitude.isFinite() && latitude in -90.0..90.0)
        require(longitude.isFinite() && longitude in -180.0..180.0)
        require(capturedAtEpochMillis > 0L)

        accuracyM?.let {
            require(it.isFinite() && it >= 0.0)
        }
    }

    override fun toString(): String =
        "FloodLocationV2Fix(redacted)"
}

/*
 * Body được tạo từ dữ liệu bất biến.
 * Retry cùng object giữ nguyên sequence và thời điểm đo GPS.
 */
class FloodLocationV2Upload private constructor(
    val sequence: Long,
    private val fix: FloodLocationV2Fix?,
    private val unavailableReason: FloodLocationUnavailableReason?
) {
    companion object {
        private val utcFormatter =
            DateTimeFormatterBuilder()
                .appendInstant(3)
                .toFormatter()

        fun available(
            sequence: Long,
            fix: FloodLocationV2Fix
        ): FloodLocationV2Upload =
            FloodLocationV2Upload(
                sequence = sequence,
                fix = fix,
                unavailableReason = null
            )

        fun unavailable(
            sequence: Long,
            reason: FloodLocationUnavailableReason
        ): FloodLocationV2Upload =
            FloodLocationV2Upload(
                sequence = sequence,
                fix = null,
                unavailableReason = reason
            )
    }

    init {
        require(sequence in 1L..9_007_199_254_740_991L)
        require((fix != null) != (unavailableReason != null))
    }

    fun toJson(): JsonObject = JsonObject().apply {
        addProperty("sequence", sequence)

        val sample = fix

        if (sample != null) {
            addProperty("availability", "available")
            add("reason", JsonNull.INSTANCE)

            add(
                "location",
                JsonObject().apply {
                    addProperty("latitude", sample.latitude)
                    addProperty("longitude", sample.longitude)
                }
            )

            addProperty(
                "capturedAt",
                utcFormatter.format(
                    Instant.ofEpochMilli(sample.capturedAtEpochMillis)
                )
            )

            if (sample.accuracyM == null) {
                add("accuracyM", JsonNull.INSTANCE)
            } else {
                addProperty("accuracyM", sample.accuracyM)
            }
        } else {
            addProperty("availability", "unavailable")
            addProperty(
                "reason",
                requireNotNull(unavailableReason).wireValue
            )
            add("location", JsonNull.INSTANCE)
            add("capturedAt", JsonNull.INSTANCE)
            add("accuracyM", JsonNull.INSTANCE)
        }
    }

    override fun toString(): String =
        "FloodLocationV2Upload(redacted)"
}