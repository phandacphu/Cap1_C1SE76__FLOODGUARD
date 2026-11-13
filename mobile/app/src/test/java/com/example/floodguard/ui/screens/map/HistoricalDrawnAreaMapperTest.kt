package com.example.floodguard.ui.screens.map

import com.google.gson.JsonParser
import org.junit.Assert.*
import org.junit.Test

class HistoricalDrawnAreaMapperTest {
    private fun parse(features: String) = parseHistoricalDrawnAreas(
        JsonParser.parseString(
            """{"type":"FeatureCollection","features":$features}"""
        ).asJsonObject
    )

    private fun feature(
        id: String = "HIST-01",
        areaType: String = "flood",
        ring: String = "[[108,16],[108.1,16],[108.1,16.1],[108,16]]"
    ): String = """
        {
          "type":"Feature",
          "properties":{
            "id":"$id","name":"TEST HIST","description":"TEST ONLY",
            "areaType":"$areaType","source":"TEST",
            "current_flood_alert":true
          },
          "geometry":{"type":"Polygon","coordinates":[$ring]}
        }
    """.trimIndent()

    @Test
    fun readsMetadataAndLongitudeLatitude_withoutBecomingCurrentAlert() {
        val area = parse("[${feature()}]").getOrThrow().single()
        assertEquals("HIST-01", area.id)
        assertEquals("TEST HIST", area.name)
        assertEquals("TEST ONLY", area.description)
        assertEquals("TEST", area.source)
        assertEquals(CitizenAreaType.FLOOD, area.areaType)
        assertEquals(16.0, area.polygon.outer.first().latitude, 0.0)
        assertEquals(108.0, area.polygon.outer.first().longitude, 0.0)
        assertFalse(area.currentFloodAlert)
        assertEquals(
            CitizenAreaType.LOW_LYING,
            parse("[${feature(areaType = "low_lying")}]").getOrThrow().single().areaType
        )
    }

    @Test
    fun preservesInteriorRings() {
        val hole = "[[108.02,16.02],[108.03,16.02],[108.03,16.03],[108.02,16.02]]"
        val outer = "[[108,16],[108.1,16],[108.1,16.1],[108,16]]"
        val polygon = feature(ring = outer).replace(
            "\"coordinates\":[$outer]",
            "\"coordinates\":[$outer,$hole]"
        )
        val area = parse("[$polygon]").getOrThrow().single()
        assertEquals(1, area.polygon.holes.size)
    }

    @Test
    fun emptyLayerIsAValidDeletionSnapshot() {
        assertTrue(parse("[]").getOrThrow().isEmpty())
    }

    @Test
    fun rejectsMalformedOrAmbiguousGeometryWithoutDroppingVertices() {
        val rings = listOf(
            """[[108,16],[108.1,16],[108.1,16.1]]""",
            """[["108",16],[108.1,16],[108.1,16.1],["108",16]]""",
            """[[108,91],[108.1,16],[108.1,16.1],[108,91]]""",
            """[[108,16],[108,16],[108,16],[108,16]]"""
        )
        rings.forEach { assertTrue(parse("[${feature(ring = it)}]").isFailure) }
        assertTrue(parse("[${feature(areaType = "unknown")}]").isFailure)
        assertTrue(parse("[${feature()},${feature()}]").isFailure)
        assertTrue(parse("[${feature().replace("Polygon", "Point")}]").isFailure)
    }
}
