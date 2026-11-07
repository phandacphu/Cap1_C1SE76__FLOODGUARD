
package com.example.floodguard.ui.screens.map

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.junit.Assert.*
import org.junit.Test

class FloodHistoryGeoJsonMapperTest {

    private fun parse(json: String): JsonObject =
        JsonParser.parseString(json).asJsonObject

    private fun collection(features: String): JsonObject =
        parse(
            """{"type":"FeatureCollection","features":$features}"""
        )

    private val square = """
        [
            [
                [108.0,16.0],
                [108.01,16.0],
                [108.01,16.01],
                [108.0,16.01],
                [108.0,16.0]
            ]
        ]
    """.trimIndent()

    @Test
    fun points_emptyFeatures_isValidSuccess() {
        val result =
            parseHistoricalFloodPointsValidated(
                collection("[]")
            ).getOrThrow()

        assertTrue(result.points.isEmpty())
        assertEquals(0, result.invalidFeatureCount)
    }

    @Test
    fun points_allInvalid_returnsFailure() {
        val geojson = collection(
            """
            [
                {
                    "type":"Feature",
                    "geometry":{
                        "type":"Point",
                        "coordinates":[999,16]
                    }
                }
            ]
            """.trimIndent()
        )

        assertTrue(
            parseHistoricalFloodPointsValidated(geojson)
                .isFailure
        )
    }

    @Test
    fun points_partiallyInvalid_reportsSkippedFeatures() {
        val geojson = collection(
            """
            [
                {
                    "type":"Feature",
                    "geometry":{
                        "type":"Point",
                        "coordinates":[108.2,16.05]
                    }
                },
                {
                    "type":"Feature",
                    "geometry":{
                        "type":"Point",
                        "coordinates":[999,16.05]
                    }
                }
            ]
            """.trimIndent()
        )

        val result =
            parseHistoricalFloodPointsValidated(geojson)
                .getOrThrow()

        assertEquals(1, result.points.size)
        assertEquals(1, result.invalidFeatureCount)
        assertEquals(16.05, result.points[0].latitude, 0.00001)
        assertEquals(108.2, result.points[0].longitude, 0.00001)
    }

    @Test
    fun points_missingFeatures_returnsFailure() {
        val geojson = parse(
            """{"type":"FeatureCollection"}"""
        )

        assertTrue(
            parseHistoricalFloodPointsValidated(geojson)
                .isFailure
        )
    }

    @Test
    fun polygon_valid_returnsOnePolygon() {
        val geojson = collection(
            """
            [{
                "type":"Feature",
                "geometry":{
                    "type":"Polygon",
                    "coordinates":$square
                }
            }]
            """.trimIndent()
        )

        val groups =
            parseHistoricalFloodPolygonFeatures(geojson)
                .getOrThrow()

        assertEquals(1, groups.size)
        assertEquals(1, groups.flatten().size)
        assertEquals(4, groups[0][0].outer.size)
    }

    @Test
    fun multipolygon_valid_returnsTwoPolygons() {
        val geojson = collection(
            """
            [{
                "type":"Feature",
                "geometry":{
                    "type":"MultiPolygon",
                    "coordinates":[$square,$square]
                }
            }]
            """.trimIndent()
        )

        val groups =
            parseHistoricalFloodPolygonFeatures(geojson)
                .getOrThrow()

        assertEquals(1, groups.size)
        assertEquals(2, groups.flatten().size)
    }

    @Test
    fun polygon_withHole_preservesHole() {
        val geojson = collection(
            """
            [{
                "type":"Feature",
                "geometry":{
                    "type":"Polygon",
                    "coordinates":[
                        [
                            [108.0,16.0],
                            [108.1,16.0],
                            [108.1,16.1],
                            [108.0,16.1],
                            [108.0,16.0]
                        ],
                        [
                            [108.02,16.02],
                            [108.03,16.02],
                            [108.03,16.03],
                            [108.02,16.02]
                        ]
                    ]
                }
            }]
            """.trimIndent()
        )

        val polygon =
            parseHistoricalFloodPolygonFeatures(geojson)
                .getOrThrow()
                .flatten()
                .single()

        assertEquals(1, polygon.holes.size)
        assertEquals(3, polygon.holes[0].size)
    }

    @Test
    fun polygon_invalidCoordinates_returnsFailure() {
        val geojson = collection(
            """
            [{
                "type":"Feature",
                "geometry":{
                    "type":"Polygon",
                    "coordinates":[
                        [
                            [999,16],
                            [108,16],
                            [108,17],
                            [999,16]
                        ]
                    ]
                }
            }]
            """.trimIndent()
        )

        assertTrue(
            parseHistoricalFloodPolygonFeatures(geojson)
                .isFailure
        )
    }

    @Test
    fun polygon_missingFeatures_returnsFailure() {
        val geojson = parse(
            """{"type":"FeatureCollection"}"""
        )

        assertTrue(
            parseHistoricalFloodPolygonFeatures(geojson)
                .isFailure
        )
    }
}
