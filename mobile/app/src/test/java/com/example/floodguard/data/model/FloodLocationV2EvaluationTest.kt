package com.example.floodguard.data.model

import com.google.gson.JsonArray
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class FloodLocationV2EvaluationTest {

    private fun match(
        id: String,
        relation: String,
        distance: Double? = null
    ) = JsonObject().apply {
        addProperty("zoneId", id)
        addProperty("group", "low_lying")
        addProperty("name", "TEST ONLY")
        addProperty("relation", relation)
        if (distance == null) {
            add("distanceToBoundaryM", JsonNull.INSTANCE)
        } else {
            addProperty("distanceToBoundaryM", distance)
        }
        add("source", JsonNull.INSTANCE)
        add("recordedAt", JsonNull.INSTANCE)
    }

    private fun response(
        status: String = "inside",
        reason: String? = null,
        matches: List<JsonObject> = listOf(match("zone-inside", "inside"))
    ): JsonObject {
        val root = JsonParser.parseString(
            """
            {
              "success": true,
              "data": {
                "evaluation": {
                  "installationId": "test-installation",
                  "bindingId": "test-binding",
                  "sequence": 1,
                  "location": {"latitude":16.0544,"longitude":108.2022},
                  "capturedAt": "2026-11-24T09:00:00.000Z",
                  "receivedAt": "2026-11-24T09:00:20.000Z",
                  "accuracyM": 20,
                  "validUntil": "2026-11-24T09:01:00.000Z",
                  "evaluatedAt": "2026-11-24T09:00:20.000Z",
                  "zonesRevision": "TEST-ZONES",
                  "coverage": {
                    "status": "complete",
                    "totalZones": 4,
                    "evaluableZones": 4,
                    "unassessableZones": []
                  },
                  "activeAlertIds": ["test-alert-1", "test-alert-2"]
                }
              }
            }
            """.trimIndent()
        ).asJsonObject

        val evaluation = evaluationJson(root)
        evaluation.addProperty("status", status)
        if (reason == null) {
            evaluation.add("reason", JsonNull.INSTANCE)
        } else {
            evaluation.addProperty("reason", reason)
        }
        evaluation.add(
            "matches",
            JsonArray().apply {
                matches.forEach { add(it) }
            }
        )
        return root
    }

    private fun evaluationJson(root: JsonObject): JsonObject =
        root.getAsJsonObject("data").getAsJsonObject("evaluation")

    private fun parse(root: JsonObject) =
        parseFloodLocationV2Evaluation(
            root,
            expectedInstallationId = "test-installation",
            expectedBindingId = "test-binding"
        )

    private fun makePartial(root: JsonObject) {
        val coverage = evaluationJson(root).getAsJsonObject("coverage")
        coverage.addProperty("status", "partial")
        coverage.addProperty("evaluableZones", 3)
        coverage.add(
            "unassessableZones",
            JsonArray().apply {
                add(
                    JsonObject().apply {
                        addProperty("zoneId", "test-unclassified")
                        addProperty("sourceKind", "admin_area")
                        addProperty("reason", "unclassified_area")
                    }
                )
            }
        )
    }

    @Test
    fun keepsAllMatchesAndSortsByOriginalDistance() {
        val result = parse(
            response(
                matches = listOf(
                    match("zone-a", "near", 200.4),
                    match("zone-c", "near", 499.0),
                    match("zone-inside", "inside"),
                    match("zone-z", "near", 200.1)
                )
            )
        )

        assertEquals(
            listOf("zone-inside", "zone-z", "zone-a", "zone-c"),
            result.matches.map { it.zoneId }
        )
        assertEquals(4, result.matches.size)
        assertEquals(
            200.1,
            requireNotNull(result.matches[1].distanceToBoundaryM),
            0.0
        )
    }

    @Test
    fun partialCoverageStillAllowsValidInsideMatch() {
        val root = response()
        makePartial(root)

        val result = parse(root)
        assertEquals(FloodLocationV2Status.INSIDE, result.status)
        assertEquals("partial", result.coverage.status)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsFarUnderPartialCoverage() {
        val root = response(status = "far", matches = emptyList())
        makePartial(root)
        parse(root)
    }

    @Test
    fun nearAccepts499And500Metres() {
        listOf(499.0, 500.0).forEach { distance ->
            val result = parse(
                response(
                    status = "near",
                    matches = listOf(match("zone-near", "near", distance))
                )
            )
            assertEquals(FloodLocationV2Status.NEAR, result.status)
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsNearMatchAt501Metres() {
        parse(
            response(
                status = "near",
                matches = listOf(match("zone-near", "near", 501.0))
            )
        )
    }

    @Test
    fun expiryClearsMatchesWithoutExtendingSampleAge() {
        val original = parse(response())
        val expiry = requireNotNull(original.validUntil)

        assertEquals(
            FloodLocationV2Status.INSIDE,
            original.forDisplayAt(expiry).status
        )

        val expired = original.forDisplayAt(expiry.plusMillis(1))
        assertEquals(FloodLocationV2Status.UNKNOWN, expired.status)
        assertEquals("stale_location", expired.reason)
        assertTrue(expired.matches.isEmpty())
        assertEquals(1, original.matches.size)
    }

    @Test
    fun noActiveAlertKeepsLocationWarningUnknown() {
        val root = response(
            status = "unknown",
            reason = "no_active_alert",
            matches = emptyList()
        )
        evaluationJson(root).add("activeAlertIds", JsonArray())

        val result = parse(root).forDisplayAt(
            Instant.parse("2026-11-24T09:00:30Z")
        )

        assertEquals(FloodLocationV2Status.UNKNOWN, result.status)
        assertTrue(result.matches.isEmpty())
        assertTrue(result.activeAlertIds.isEmpty())
    }

    @Test
    fun noLocationPreservesNullSequenceAndTimes() {
        val root = response(
            status = "unknown",
            reason = "no_location",
            matches = emptyList()
        )

        val json = evaluationJson(root)
        listOf(
            "sequence", "location", "capturedAt",
            "receivedAt", "accuracyM", "validUntil"
        ).forEach {
            json.add(it, JsonNull.INSTANCE)
        }

        val result = parse(root)
        assertNull(result.sequence)
        assertNull(result.capturedAt)
        assertNull(result.validUntil)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsDifferentBinding() {
        val root = response()
        evaluationJson(root).addProperty("bindingId", "old-binding")
        parse(root)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsExpiryCalculatedFromEvaluationTime() {
        val root = response()
        evaluationJson(root).addProperty(
            "validUntil",
            "2026-11-24T09:01:20.000Z"
        )
        parse(root)
    }
}