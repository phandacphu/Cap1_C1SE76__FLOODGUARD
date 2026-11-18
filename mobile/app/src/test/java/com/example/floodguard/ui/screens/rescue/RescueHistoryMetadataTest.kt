package com.example.floodguard.ui.screens.rescue

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RescueHistoryMetadataTest {
    private fun parse(text: String, layer: String) =
        parseRescueHistoryLayer(JsonParser.parseString(text).asJsonObject, layer)

    @Test fun pointsKeepIdDescriptionTypeAndIndependentSource() {
        val result = parse("""
            {"type":"FeatureCollection","features":[
              {"properties":{"id":"HIST-08","name":"Me Suot - Hoa Khanh Nam", "description":"mota8", "areaType":"flood", "source":"https://example.org/history"},
               "geometry":{"type":"Point","coordinates":[108.2,16.1]}},
              {"properties":{"id":"HIST-22", "description":"mota22", "areaType":"flood", "source":"mota22"},
               "geometry":{"type":"Point","coordinates":[108.2,16.1]}}
            ]}
        """.trimIndent(), "points")
        val byId = result.points.associateBy { it.id }
        assertEquals("mota8", byId["HIST-08"]?.description)
        assertEquals("flood", byId["HIST-08"]?.areaType)
        assertEquals("https://example.org/history", byId["HIST-08"]?.source)
        assertEquals("mota22", byId["HIST-22"]?.description)
        assertEquals("mota22", byId["HIST-22"]?.source)
        assertEquals(RescueFloodVertex(16.1, 108.2), byId["HIST-08"]?.position)
    }

    @Test fun polygonMetadataPreservedByStableId() {
        val result = parse("""
            {"type":"FeatureCollection","features":[{
              "properties":{"id":"HIST-08","name":"Me Suot - Hoa Khanh Nam", "description":"mota8", "areaType":"flood", "source":"abc"},
              "geometry":{"type":"Polygon","coordinates":[[
                [108.2,16.1],[108.3,16.1],[108.3,16.2],[108.2,16.1]
              ]]}
            }]}
        """.trimIndent(), "areas")
        val polygon = result.polygons.single()
        assertEquals("HIST-08", polygon.id)
        assertEquals("Me Suot - Hoa Khanh Nam", polygon.name)
        assertEquals("mota8", polygon.description)
        assertEquals("flood", polygon.areaType)
        assertEquals("abc", polygon.source)
        assertEquals(3, polygon.outer.size)
    }

    @Test fun missingMetadataStaysOptional() {
        val result = parse("""
            {"type":"FeatureCollection","features":[{
              "geometry":{"type":"Polygon","coordinates":[[
                [108.2,16.1],[108.3,16.1],[108.3,16.2],[108.2,16.1]
              ]]}
            }]}
        """.trimIndent(), "areas")
        val polygon = result.polygons.single()
        assertNull(polygon.id)
        assertNull(polygon.description)
        assertNull(polygon.areaType)
        assertNull(polygon.source)
    }
}
