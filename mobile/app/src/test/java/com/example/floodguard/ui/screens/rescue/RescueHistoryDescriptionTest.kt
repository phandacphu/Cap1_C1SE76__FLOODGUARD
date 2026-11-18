package com.example.floodguard.ui.screens.rescue

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RescueHistoryDescriptionTest {
    private fun parse(json: String) = parseRescueHistoryLayer(
        JsonParser.parseString(json).asJsonObject, "points"
    )

    @Test fun keepsMota8ForHist08() {
        val result = parse("""
          {"type":"FeatureCollection","features":[{
            "properties":{"id":"HIST-08","name":"Me Suot - Hoa Khanh Nam","description":"mota8"},
            "geometry":{"type":"Point","coordinates":[108.2,16.1]}
          }]}
        """)
        val point = result.points.single()
        assertEquals("HIST-08", point.id)
        assertEquals("Me Suot - Hoa Khanh Nam", point.name)
        assertEquals("mota8", rescueHistoryDescriptionText(point.description))
        assertEquals(RescueFloodVertex(16.1, 108.2), point.position)
    }

    @Test fun bindsDescriptionsToIdsEvenWhenCoordinatesMatch() {
        val result = parse("""
          {"type":"FeatureCollection","features":[
            {"properties":{"id":"HIST-01","description":"mo ta 1"},
             "geometry":{"type":"Point","coordinates":[108.2,16.1]}},
            {"properties":{"id":"HIST-08","description":"mota8"},
             "geometry":{"type":"Point","coordinates":[108.2,16.1]}}
          ]}
        """)
        val byId = result.points.associateBy { it.id }
        assertEquals("mo ta 1", byId["HIST-01"]?.description)
        assertEquals("mota8", byId["HIST-08"]?.description)
    }

    @Test fun missingPropertiesRemainOptionalForLegacyPoints() {
        val result = parse("""
          {"type":"FeatureCollection","features":[
            {"geometry":{"type":"Point","coordinates":[108.2,16.1]}}
          ]}
        """)
        val point = result.points.single()
        assertNull(point.id)
        assertNull(point.name)
        assertNull(point.description)
        assertEquals("Chưa có mô tả", rescueHistoryDescriptionText(point.description))
    }

    @Test fun blankDescriptionUsesFallbackOnlyWhenBlank() {
        assertEquals("Chưa có mô tả", rescueHistoryDescriptionText("  "))
        assertEquals("mota8", rescueHistoryDescriptionText(" mota8 "))
    }

    @Test fun historicalAreaTypeLabelsAreCorrect() {
        assertEquals("Vùng ngập", rescueHistoryAreaTypeLabel("flood"))
        assertEquals("Vùng trũng", rescueHistoryAreaTypeLabel("low_lying"))
        assertEquals("Chưa phân loại", rescueHistoryAreaTypeLabel(null))
    }
}
