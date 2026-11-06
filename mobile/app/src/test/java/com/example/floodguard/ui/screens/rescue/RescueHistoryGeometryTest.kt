package com.example.floodguard.ui.screens.rescue

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class RescueHistoryGeometryTest {
    private fun json(text: String) = JsonParser.parseString(text).asJsonObject

    @Test fun readsPointLongitudeBeforeLatitude() {
        val result = parseRescueHistoryLayer(json("""
          {"type":"FeatureCollection","features":[{"geometry":{"type":"Point","coordinates":[108.2,16.1]}}]}
        """), "points")
        assertEquals(RescueFloodVertex(16.1, 108.2), result.points.single())
    }

    @Test fun readsMultipolygonAndHoles() {
        val result = parseRescueHistoryLayer(json("""
          {"type":"FeatureCollection","features":[{"geometry":{"type":"MultiPolygon","coordinates":[
            [[[108,16],[109,16],[109,17],[108,16]],[[108.1,16.1],[108.2,16.1],[108.2,16.2],[108.1,16.1]]],
            [[[107,15],[108,15],[108,16],[107,15]]]
          ]}}]}
        """), "radar")
        assertEquals(2, result.polygons.size)
        assertEquals(1, result.polygons[0].holes.size)
        assertEquals(3, result.polygons[0].outer.size)
    }

    @Test fun rejectsInvalidCoordinatesAndWrongGeometry() {
        assertThrows(IllegalArgumentException::class.java) {
            parseRescueHistoryLayer(json("""
                {"type":"FeatureCollection","features":[{"geometry":{"type":"Point","coordinates":[108,100]}}]}
            """), "points")
        }
        assertThrows(IllegalArgumentException::class.java) {
            parseRescueHistoryLayer(json("""
                {"type":"FeatureCollection","features":[{"geometry":{"type":"Point","coordinates":[108,16]}}]}
            """), "radar")
        }
    }
}
