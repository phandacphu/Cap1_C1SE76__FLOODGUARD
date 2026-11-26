package com.example.floodguard.data.model

import com.example.floodguard.data.repository.WarningZoneCoverage
import com.example.floodguard.data.repository.WarningZoneDiagnostic
import com.example.floodguard.data.repository.WarningZoneGroup
import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import java.time.Instant

enum class FloodLocationV2Status {
    INSIDE,
    NEAR,
    FAR,
    UNKNOWN
}

data class FloodLocationV2Position(
    val latitude: Double,
    val longitude: Double
) {
    override fun toString(): String =
        "FloodLocationV2Position(redacted)"
}

data class FloodLocationV2Match(
    val zoneId: String,
    val group: WarningZoneGroup,
    val name: String?,
    val relation: FloodLocationV2Status,
    val distanceToBoundaryM: Double?,
    val source: String?,
    val recordedAt: String?
)

data class FloodLocationV2Evaluation(
    val installationId: String,
    val bindingId: String,
    val sequence: Long?,
    val location: FloodLocationV2Position?,
    val capturedAt: Instant?,
    val receivedAt: Instant?,
    val accuracyM: Double?,
    val validUntil: Instant?,
    val evaluatedAt: Instant,
    val zonesRevision: String,
    val status: FloodLocationV2Status,
    val reason: String?,
    val coverage: WarningZoneCoverage,
    val matches: List<FloodLocationV2Match>,
    val activeAlertIds: List<String>
) {
    /*
     * Chỉ vô hiệu kết quả đã hết điều kiện.
     * Không tự tính inside/near/far từ tọa độ.
     */
    fun forDisplayAt(now: Instant): FloodLocationV2Evaluation {
        if (activeAlertIds.isEmpty()) {
            return asUnknown("no_active_alert")
        }

        if (status == FloodLocationV2Status.UNKNOWN) return this

        if (location == null || capturedAt == null || validUntil == null) {
            return asUnknown("no_location")
        }

        if (now.isBefore(capturedAt)) {
            return asUnknown("invalid_location_time")
        }

        // Mốc đúng 60 giây vẫn thuộc giới hạn cho phép.
        if (now.isAfter(validUntil)) {
            return asUnknown("stale_location")
        }

        if (accuracyM == null || accuracyM > 100.0) {
            return asUnknown("poor_accuracy")
        }

        return this
    }

    private fun asUnknown(
        why: String
    ): FloodLocationV2Evaluation =
        copy(
            status = FloodLocationV2Status.UNKNOWN,
            reason = why,
            matches = emptyList()
        )

    override fun toString(): String =
        "FloodLocationV2Evaluation(redacted)"
}

internal fun parseFloodLocationV2Evaluation(
    root: JsonObject,
    expectedInstallationId: String,
    expectedBindingId: String
): FloodLocationV2Evaluation {
    val success = root.evRequired("success")
    require(
        success.isJsonPrimitive &&
                success.asJsonPrimitive.isBoolean &&
                success.asBoolean
    )

    val json = root.evObject("data").evObject("evaluation")

    val installationId = json.evText("installationId")
    val bindingId = json.evText("bindingId")

    require(installationId == expectedInstallationId) {
        "Evaluation không thuộc installation hiện tại."
    }
    require(bindingId == expectedBindingId) {
        "Evaluation không thuộc binding hiện tại."
    }

    val coverageJson = json.evObject("coverage")
    val coverageStatus = coverageJson.evText("status")
    require(
        coverageStatus in setOf("complete", "partial", "unavailable")
    )

    val coverage = WarningZoneCoverage(
        status = coverageStatus,
        totalZones = coverageJson.evCount("totalZones"),
        evaluableZones = coverageJson.evCount("evaluableZones"),
        unassessableZones = coverageJson
            .evArray("unassessableZones")
            .map { element ->
                val diagnostic = element.evObjectValue()
                WarningZoneDiagnostic(
                    reason = diagnostic.evText("reason"),
                    sourceKind = diagnostic.evOptionalText("sourceKind"),
                    zoneId = diagnostic.evOptionalText("zoneId")
                )
            }
    )

    require(coverage.evaluableZones <= coverage.totalZones)

    if (coverage.status == "complete") {
        require(coverage.evaluableZones == coverage.totalZones)
        require(coverage.unassessableZones.isEmpty())
    }
    if (coverage.status == "unavailable") {
        require(coverage.evaluableZones == 0)
    }

    val locationJson = json.evRequired("location")
    val position = if (locationJson.isJsonNull) {
        null
    } else {
        val point = locationJson.evObjectValue()
        val latitude = point.evRequired("latitude").evNumber()
        val longitude = point.evRequired("longitude").evNumber()

        require(latitude in -90.0..90.0)
        require(longitude in -180.0..180.0)

        FloodLocationV2Position(latitude, longitude)
    }

    val matches = json.evArray("matches").map { element ->
        val match = element.evObjectValue()

        val group = when (match.evText("group")) {
            "current_flood" -> WarningZoneGroup.CURRENT_FLOOD
            "historical_flood" -> WarningZoneGroup.HISTORICAL_FLOOD
            "low_lying" -> WarningZoneGroup.LOW_LYING
            else -> error("Nhóm vùng trong evaluation không hợp lệ.")
        }

        val relation = when (match.evText("relation")) {
            "inside" -> FloodLocationV2Status.INSIDE
            "near" -> FloodLocationV2Status.NEAR
            else -> error("Quan hệ vùng không hợp lệ.")
        }

        val distance = match.evNullableNumber("distanceToBoundaryM")

        if (relation == FloodLocationV2Status.INSIDE) {
            require(distance == null)
        } else {
            require(distance != null && distance in 0.0..500.0)
        }

        FloodLocationV2Match(
            zoneId = match.evText("zoneId"),
            group = group,
            name = match.evOptionalText("name"),
            relation = relation,
            distanceToBoundaryM = distance,
            source = match.evOptionalText("source"),
            recordedAt = match.evOptionalText("recordedAt")
        )
    }.sortedWith(
        compareBy<FloodLocationV2Match> {
            if (it.relation == FloodLocationV2Status.INSIDE) 0 else 1
        }
            .thenBy { it.distanceToBoundaryM ?: 0.0 }
            .thenBy { it.zoneId }
    )

    require(matches.map { it.zoneId }.distinct().size == matches.size)

    val activeAlertIds = json.evArray("activeAlertIds").map { element ->
        require(
            element.isJsonPrimitive &&
                    element.asJsonPrimitive.isString
        )
        element.asString.also { require(it.isNotBlank()) }
    }
    require(activeAlertIds.distinct().size == activeAlertIds.size)

    val status = when (json.evText("status")) {
        "inside" -> FloodLocationV2Status.INSIDE
        "near" -> FloodLocationV2Status.NEAR
        "far" -> FloodLocationV2Status.FAR
        "unknown" -> FloodLocationV2Status.UNKNOWN
        else -> error("Trạng thái evaluation không hợp lệ.")
    }

    val evaluation = FloodLocationV2Evaluation(
        installationId = installationId,
        bindingId = bindingId,
        sequence = json.evNullableSequence("sequence"),
        location = position,
        capturedAt = json.evNullableInstant("capturedAt"),
        receivedAt = json.evNullableInstant("receivedAt"),
        accuracyM = json.evNullableNumber("accuracyM"),
        validUntil = json.evNullableInstant("validUntil"),
        evaluatedAt = requireNotNull(
            json.evNullableInstant("evaluatedAt")
        ),
        zonesRevision = json.evText("zonesRevision"),
        status = status,
        reason = json.evNullableText("reason"),
        coverage = coverage,
        matches = matches,
        activeAlertIds = activeAlertIds
    )

    evaluation.accuracyM?.let { require(it >= 0.0) }

    if (evaluation.sequence == null) {
        require(evaluation.location == null)
        require(evaluation.capturedAt == null)
        require(evaluation.receivedAt == null)
        require(evaluation.accuracyM == null)
        require(evaluation.validUntil == null)
    }

    if (evaluation.location == null) {
        require(evaluation.capturedAt == null)
        require(evaluation.accuracyM == null)
        require(evaluation.validUntil == null)
    } else {
        require(evaluation.sequence != null)
        require(evaluation.capturedAt != null)
    }

    if (evaluation.capturedAt == null) {
        require(evaluation.validUntil == null)
    } else {
        require(
            evaluation.validUntil ==
                    evaluation.capturedAt.plusMillis(60_000L)
        ) {
            "validUntil không khớp thời điểm đo GPS."
        }
    }

    if (status == FloodLocationV2Status.UNKNOWN) {
        require(!evaluation.reason.isNullOrBlank())
        require(matches.isEmpty())
    } else {
        require(evaluation.reason == null)
        require(activeAlertIds.isNotEmpty())
        require(evaluation.location != null)

        val capturedAt = requireNotNull(evaluation.capturedAt)
        val validUntil = requireNotNull(evaluation.validUntil)
        val accuracy = requireNotNull(evaluation.accuracyM)

        require(accuracy in 0.0..100.0)
        require(evaluation.evaluatedAt >= capturedAt)
        require(evaluation.evaluatedAt <= validUntil)
        require(coverage.evaluableZones > 0)

        when (status) {
            FloodLocationV2Status.INSIDE -> {
                require(coverage.status != "unavailable")
                require(
                    matches.any {
                        it.relation == FloodLocationV2Status.INSIDE
                    }
                )
            }

            FloodLocationV2Status.NEAR -> {
                require(coverage.status != "unavailable")
                require(matches.isNotEmpty())
                require(
                    matches.all {
                        it.relation == FloodLocationV2Status.NEAR
                    }
                )
            }

            FloodLocationV2Status.FAR -> {
                require(matches.isEmpty())
                require(coverage.status == "complete")
            }

            FloodLocationV2Status.UNKNOWN -> Unit
        }
    }

    return evaluation
}

private fun JsonObject.evRequired(key: String): JsonElement =
    requireNotNull(get(key)) { "Evaluation thiếu $key." }

private fun JsonElement.evObjectValue(): JsonObject {
    require(isJsonObject)
    return asJsonObject
}

private fun JsonObject.evObject(key: String): JsonObject =
    evRequired(key).evObjectValue()

private fun JsonObject.evArray(key: String): JsonArray {
    val value = evRequired(key)
    require(value.isJsonArray)
    return value.asJsonArray
}

private fun JsonObject.evNullableText(key: String): String? {
    val value = evRequired(key)
    if (value.isJsonNull) return null
    require(value.isJsonPrimitive && value.asJsonPrimitive.isString)
    return value.asString
}

private fun JsonObject.evOptionalText(key: String): String? {
    if (!has(key)) return null
    return evNullableText(key)
}

private fun JsonObject.evText(key: String): String =
    requireNotNull(evNullableText(key)).also {
        require(it.isNotBlank())
    }

private fun JsonElement.evNumber(): Double {
    require(isJsonPrimitive && asJsonPrimitive.isNumber)
    return asDouble.also { require(it.isFinite()) }
}

private fun JsonObject.evNullableNumber(key: String): Double? {
    val value = evRequired(key)
    return if (value.isJsonNull) null else value.evNumber()
}

private fun JsonObject.evCount(key: String): Int {
    val value = evRequired(key)
    require(value.isJsonPrimitive && value.asJsonPrimitive.isNumber)
    return value.asBigDecimal.intValueExact().also {
        require(it >= 0)
    }
}

private fun JsonObject.evNullableSequence(key: String): Long? {
    val value = evRequired(key)
    if (value.isJsonNull) return null

    require(value.isJsonPrimitive && value.asJsonPrimitive.isNumber)
    return value.asBigDecimal.longValueExact().also {
        require(it in 1L..9_007_199_254_740_991L)
    }
}

private fun JsonObject.evNullableInstant(key: String): Instant? {
    val value = evNullableText(key) ?: return null
    require(value.endsWith("Z"))
    return Instant.parse(value)
}