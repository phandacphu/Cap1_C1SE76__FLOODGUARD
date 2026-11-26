package com.example.floodguard.core.notifications

import com.example.floodguard.data.model.FloodLocationV2Evaluation
import com.example.floodguard.data.model.parseFloodLocationV2Evaluation
import com.example.floodguard.data.repository.FloodWarningV2
import com.google.gson.JsonParser
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

class FloodWarningPushPolicyTest {
    private val now = Instant.parse("2026-11-24T09:00:30Z")

    private fun push(
        kind: String = "general",
        bindingId: String = "test-binding"
    ): FloodWarningV2Push =
        FloodWarningV2Push.parse(
            mapOf(
                "schemaVersion" to "2",
                "eventId" to "test-event",
                "alertId" to "test-alert",
                "kind" to kind,
                "title" to "Kiểm thử",
                "body" to "Nội dung kiểm thử.",
                "createdAt" to "2026-11-24T09:00:00Z",
                "installationId" to "test-installation",
                "bindingId" to bindingId
            )
        ).getOrThrow()

    private fun alert() = FloodWarningV2(
        id = "test-alert",
        title = "Bản tin kiểm thử",
        content = "Nội dung kiểm thử.",
        status = "active",
        scope = "all_published_zones",
        startAt = "2026-11-24T08:00:00Z",
        endAt = null,
        createdAt = "2026-11-24T08:00:00Z",
        updatedAt = "2026-11-24T08:00:00Z",
        revision = 1
    )

    private fun evaluation(
        relation: String = "near",
        sequence: Long = 7,
        bindingId: String = "test-binding",
        activeAlertId: String = "test-alert"
    ): FloodLocationV2Evaluation {
        val distance = if (relation == "inside") "null" else "499.5"

        val root = JsonParser.parseString(
            """
            {
              "success": true,
              "data": {
                "evaluation": {
                  "installationId": "test-installation",
                  "bindingId": "$bindingId",
                  "sequence": $sequence,
                  "location": {
                    "latitude": 16.0544,
                    "longitude": 108.2022
                  },
                  "capturedAt": "2026-11-24T09:00:00.000Z",
                  "receivedAt": "2026-11-24T09:00:01.000Z",
                  "accuracyM": 20,
                  "validUntil": "2026-11-24T09:01:00.000Z",
                  "evaluatedAt": "2026-11-24T09:00:20.000Z",
                  "zonesRevision": "TEST",
                  "status": "$relation",
                  "reason": null,
                  "coverage": {
                    "status": "partial",
                    "totalZones": 2,
                    "evaluableZones": 1,
                    "unassessableZones": [
                      {
                        "reason": "unclassified",
                        "sourceKind": "TEST",
                        "zoneId": "unknown-zone"
                      }
                    ]
                  },
                  "matches": [
                    {
                      "zoneId": "test-zone",
                      "group": "historical_flood",
                      "name": "Vùng kiểm thử",
                      "relation": "$relation",
                      "distanceToBoundaryM": $distance,
                      "source": "TEST",
                      "recordedAt": null
                    }
                  ],
                  "activeAlertIds": ["$activeAlertId"]
                }
              }
            }
            """.trimIndent()
        ).asJsonObject

        return parseFloodLocationV2Evaluation(
            root,
            "test-installation",
            bindingId
        )
    }

    private fun check(
        kind: String,
        evaluation: FloodLocationV2Evaluation?,
        locationUsable: Boolean = true,
        time: Instant = now
    ) = FloodWarningPushPolicy.check(
        push = push(kind),
        installationId = "test-installation",
        bindingId = "test-binding",
        alert = alert(),
        evaluation = evaluation,
        latestSequence = 7,
        locationUsable = locationUsable,
        now = time
    )

    @Test
    fun generalIsAllowedWithoutGps() {
        assertEquals(
            FloodWarningPushCheck.ALLOW_GENERAL,
            FloodWarningPushPolicy.check(
                push = push(),
                installationId = "test-installation",
                bindingId = "test-binding",
                alert = alert(),
                locationUsable = false,
                now = now
            )
        )
    }

    @Test
    fun rejectsWrongTargetBeforeProcessingControl() {
        assertEquals(
            FloodWarningPushCheck.WRONG_TARGET,
            FloodWarningPushPolicy.check(
                push = push("deactivated", "old-binding"),
                installationId = "test-installation",
                bindingId = "test-binding",
                alert = null,
                now = now
            )
        )
    }

    @Test
    fun requiresExactActiveDetail() {
        fun checkDetail(detail: FloodWarningV2?) =
            FloodWarningPushPolicy.check(
                push = push(),
                installationId = "test-installation",
                bindingId = "test-binding",
                alert = detail,
                now = now
            )

        assertEquals(
            FloodWarningPushCheck.DETAIL_REQUIRED,
            checkDetail(null)
        )
        assertEquals(
            FloodWarningPushCheck.WRONG_ALERT,
            checkDetail(alert().copy(id = "another-alert"))
        )
        assertEquals(
            FloodWarningPushCheck.ALERT_INACTIVE,
            checkDetail(
                alert().copy(
                    status = "inactive",
                    endAt = "2026-11-24T08:30:00Z"
                )
            )
        )
    }

    @Test
    fun acceptsValidNearAndInsideEvenWithPartialCoverage() {
        assertEquals(
            FloodWarningPushCheck.ALLOW_NEAR,
            check("near", evaluation("near"))
        )
        assertEquals(
            FloodWarningPushCheck.ALLOW_INSIDE,
            check("inside", evaluation("inside"))
        )
    }

    @Test
    fun doesNotConvertNearIntoInsideOrInsideIntoNear() {
        assertEquals(
            FloodWarningPushCheck.LOCATION_UNVERIFIED,
            check("near", evaluation("inside"))
        )
        assertEquals(
            FloodWarningPushCheck.LOCATION_UNVERIFIED,
            check("inside", evaluation("near"))
        )
    }

    @Test
    fun rejectsStaleWrongBindingSequenceAndAlert() {
        listOf(
            evaluation(sequence = 6),
            evaluation(bindingId = "old-binding"),
            evaluation(activeAlertId = "another-alert")
        ).forEach { evaluation ->
            assertEquals(
                FloodWarningPushCheck.LOCATION_UNVERIFIED,
                check("near", evaluation)
            )
        }

        assertEquals(
            FloodWarningPushCheck.LOCATION_UNVERIFIED,
            check(
                "near",
                evaluation(),
                time = Instant.parse("2026-11-24T09:01:00.001Z")
            )
        )
    }

    @Test
    fun rejectsLocationPushWhenPhoneLocationIsNotUsable() {
        assertEquals(
            FloodWarningPushCheck.LOCATION_UNVERIFIED,
            check("near", evaluation(), locationUsable = false)
        )
        assertEquals(
            FloodWarningPushCheck.EVALUATION_REQUIRED,
            check("near", null)
        )
    }

    @Test
    fun deactivationIsControlWithoutDisplayDecision() {
        assertEquals(
            FloodWarningPushCheck.CONTROL_ONLY,
            FloodWarningPushPolicy.check(
                push = push("deactivated"),
                installationId = "test-installation",
                bindingId = "test-binding",
                alert = null,
                now = now
            )
        )
    }
}