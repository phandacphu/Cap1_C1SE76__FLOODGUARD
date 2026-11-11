package com.example.floodguard.ui.screens.rescue

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class RescueHistoricalAreasTest {

    private fun parse(json: String) =
        parseRescueHistoryLayer(
            JsonParser.parseString(json).asJsonObject,
            "areas"
        )

    @Test
    fun validAdminPolygonLoadsCorrectly() {
        val result = parse("""
            {
              "type":"FeatureCollection",
              "features":[{
                "type":"Feature",
                "geometry":{
                  "type":"Polygon",
                  "coordinates":[[
                    [108.0,16.0],
                    [108.02,16.0],
                    [108.02,16.02],
                    [108.0,16.0]
                  ]]
                }
              }]
            }
        """.trimIndent())

        assertEquals(1, result.polygons.size)
        assertEquals(3, result.polygons.single().outer.size)
        assertTrue(result.points.isEmpty())
    }

    @Test
    fun adminMultiPolygonPreservesHoles() {
        val result = parse("""
            {
              "type":"FeatureCollection",
              "features":[{
                "type":"Feature",
                "geometry":{
                  "type":"MultiPolygon",
                  "coordinates":[
                    [
                      [
                        [108,16],[109,16],
                        [109,17],[108,16]
                      ],
                      [
                        [108.1,16.1],[108.2,16.1],
                        [108.2,16.2],[108.1,16.1]
                      ]
                    ],
                    [
                      [
                        [107,15],[108,15],
                        [108,16],[107,15]
                      ]
                    ]
                  ]
                }
              }]
            }
        """.trimIndent())

        assertEquals(2, result.polygons.size)
        assertEquals(1, result.polygons[0].holes.size)
        assertEquals(3, result.polygons[1].outer.size)
    }

    @Test
    fun invalidCoordinatesAreRejected() {
        assertThrows(IllegalArgumentException::class.java) {
            parse("""
                {
                  "type":"FeatureCollection",
                  "features":[{
                    "geometry":{
                      "type":"Polygon",
                      "coordinates":[[
                        [999,16],[108,16],
                        [108,17],[999,16]
                      ]]
                    }
                  }]
                }
            """.trimIndent())
        }
    }

    @Test
    fun pointGeometryIsRejectedForAreas() {
        assertThrows(IllegalArgumentException::class.java) {
            parse("""
                {
                  "type":"FeatureCollection",
                  "features":[{
                    "geometry":{
                      "type":"Point",
                      "coordinates":[108.2,16.1]
                    }
                  }]
                }
            """.trimIndent())
        }
    }

    @Test
    fun emptyAreasCollectionIsValid() {
        val result = parse("""
            {
              "type":"FeatureCollection",
              "features":[]
            }
        """.trimIndent())

        assertTrue(result.points.isEmpty())
        assertTrue(result.polygons.isEmpty())
    }
}