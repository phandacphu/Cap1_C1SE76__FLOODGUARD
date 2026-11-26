package com.example.floodguard.data.repository

import com.example.floodguard.data.remote.api.RescueFloodWarningV2Api
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class RescueFloodWarningV2ZonesRepositoryTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: RescueFloodWarningV2ZonesRepository

    private val ringA =
        """[[108.2,16.05],[108.21,16.05],[108.21,16.06],[108.2,16.06],[108.2,16.05]]"""

    private val ringB =
        """[[108.3,16.1],[108.31,16.1],[108.31,16.11],[108.3,16.11],[108.3,16.1]]"""

    private val hole =
        """[[108.202,16.052],[108.204,16.052],[108.204,16.054],[108.202,16.054],[108.202,16.052]]"""

    private val polygon =
        """{"type":"Polygon","coordinates":[$ringA]}"""

    @Before
    fun setup() {
        server = MockWebServer()
        server.start()

        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request().newBuilder()
                    .header(
                        "Authorization",
                        "Bearer mock-rescue-token"
                    )
                    .build()

                chain.proceed(request)
            }
            .build()

        val api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(RescueFloodWarningV2Api::class.java)

        repository = RescueFloodWarningV2ZonesRepository(api)
    }

    @After
    fun cleanup() {
        server.shutdown()
    }

    private fun feature(
        id: String,
        group: String? = "current_flood",
        geometry: String = polygon,
        geometryStatus: String = "valid",
        name: String? = "Vùng kiểm thử"
    ): String {
        val groupJson = group?.let { "\"$it\"" } ?: "null"
        val nameJson = name?.let { "\"$it\"" } ?: "null"

        return """
            {
              "type": "Feature",
              "geometry": $geometry,
              "properties": {
                "zoneId": "$id",
                "group": $groupJson,
                "name": $nameJson,
                "sourceKind": "admin_area",
                "source": null,
                "geometryStatus": "$geometryStatus"
              }
            }
        """.trimIndent()
    }

    private fun response(
        features: String,
        total: Int,
        evaluable: Int = total,
        coverageStatus: String = "complete",
        diagnostics: String = "[]",
        geojsonType: String = "FeatureCollection"
    ): String = """
        {
          "success": true,
          "message": "OK",
          "data": {
            "zonesRevision": "test-revision-1",
            "generatedAt": "2026-11-22T01:00:30.000Z",
            "coverage": {
              "status": "$coverageStatus",
              "totalZones": $total,
              "evaluableZones": $evaluable,
              "unassessableZones": $diagnostics
            },
            "geojson": {
              "type": "$geojsonType",
              "features": [$features]
            }
          }
        }
    """.trimIndent()

    private fun enqueue(body: String, status: Int = 200) {
        server.enqueue(
            MockResponse()
                .setResponseCode(status)
                .addHeader("Content-Type", "application/json")
                .setBody(body)
        )
    }

    private fun fetch(): RescueWarningV2Result<RescueWarningZonesSnapshot> =
        runBlocking { repository.getZones() }

    private fun successful(
        result: RescueWarningV2Result<RescueWarningZonesSnapshot>
    ): RescueWarningZonesSnapshot = when (result) {
        is RescueWarningV2Result.Success -> result.data
        is RescueWarningV2Result.Failure ->
            throw AssertionError(result.message)
    }

    private fun failed(
        result: RescueWarningV2Result<RescueWarningZonesSnapshot>
    ): RescueWarningV2FailureKind = when (result) {
        is RescueWarningV2Result.Failure -> result.kind
        is RescueWarningV2Result.Success ->
            throw AssertionError("Expected failure")
    }

    @Test
    fun loadsAllThreeGroupsAndUsesCorrectEndpoint() {
        val features = listOf(
            feature("admin:a", "current_flood"),
            feature("history:b", "historical_flood"),
            feature("radar:c", "low_lying")
        ).joinToString(",")

        enqueue(response(features, total = 3))

        val snapshot = successful(fetch())

        assertEquals(3, snapshot.zones.size)
        assertEquals(
            setOf("current_flood", "historical_flood", "low_lying"),
            snapshot.zones.map { it.group }.toSet()
        )
        assertEquals("test-revision-1", snapshot.revision)
        assertEquals("complete", snapshot.coverageStatus)
        assertFalse(snapshot.incompleteForDisplay)

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals(
            "/api/flood-alerts/zones",
            request.requestUrl?.encodedPath
        )
        assertEquals(
            "Bearer mock-rescue-token",
            request.getHeader("Authorization")
        )
    }

    @Test
    fun preservesLongitudeLatitudeOrderAndPolygonHole() {
        val geometry =
            """{"type":"Polygon","coordinates":[$ringA,$hole]}"""

        enqueue(
            response(
                feature("admin:hole", geometry = geometry),
                total = 1
            )
        )

        val zone = successful(fetch()).zones.single()
        val shape = zone.polygons.single()

        assertEquals(5, shape.outer.size)
        assertEquals(1, shape.holes.size)
        assertEquals(5, shape.holes.single().size)

        assertEquals(16.05, shape.outer.first().latitude, 0.000001)
        assertEquals(108.2, shape.outer.first().longitude, 0.000001)
    }

    @Test
    fun supportsMultiPolygonWithoutMergingItsParts() {
        val geometry =
            """{"type":"MultiPolygon","coordinates":[[$ringA],[$ringB]]}"""

        enqueue(
            response(
                feature("admin:multi", geometry = geometry),
                total = 1
            )
        )

        val zone = successful(fetch()).zones.single()

        assertEquals(2, zone.polygons.size)
        assertEquals(
            108.3,
            zone.polygons[1].outer.first().longitude,
            0.000001
        )
    }

    @Test
    fun keepsPartialCoverageAndUnclassifiedDiagnostics() {
        val features = listOf(
            feature("admin:valid"),
            feature(
                id = "admin:unknown",
                group = null,
                geometry = "null",
                geometryStatus = "invalid",
                name = null
            )
        ).joinToString(",")

        val diagnostics = """
            [
              {
                "zoneId": "admin:unknown",
                "reason": "unclassified_area",
                "sourceKind": "admin_area"
              }
            ]
        """.trimIndent()

        enqueue(
            response(
                features = features,
                total = 2,
                evaluable = 1,
                coverageStatus = "partial",
                diagnostics = diagnostics
            )
        )

        val snapshot = successful(fetch())

        assertEquals("partial", snapshot.coverageStatus)
        assertEquals(2, snapshot.totalZones)
        assertEquals(1, snapshot.evaluableZones)
        assertEquals(1, snapshot.zones.size)
        assertEquals(1, snapshot.skippedFeatures)
        assertEquals(1, snapshot.diagnostics.size)
        assertEquals(
            "unclassified_area",
            snapshot.diagnostics.single().reason
        )
        assertTrue(snapshot.incompleteForDisplay)
    }

    @Test
    fun neverCreatesPolygonFromHistoricalPoint() {
        val point = """{"type":"Point","coordinates":[108.2,16.05]}"""

        enqueue(
            response(
                feature(
                    id = "history:point",
                    group = "historical_flood",
                    geometry = point
                ),
                total = 1,
                evaluable = 0,
                coverageStatus = "partial"
            )
        )

        val snapshot = successful(fetch())

        assertTrue(snapshot.zones.isEmpty())
        assertEquals(1, snapshot.skippedFeatures)
        assertTrue(snapshot.incompleteForDisplay)
    }

    @Test
    fun handlesMissingGeometryWithoutInventingBoundary() {
        enqueue(
            response(
                feature(
                    id = "history:no-outline",
                    group = "historical_flood",
                    geometry = "null",
                    geometryStatus = "missing"
                ),
                total = 1,
                evaluable = 0,
                coverageStatus = "partial"
            )
        )

        val snapshot = successful(fetch())

        assertEquals(0, snapshot.zones.size)
        assertEquals(1, snapshot.skippedFeatures)
    }

    @Test
    fun skipsOpenPolygonRing() {
        val badGeometry = """
            {
              "type": "Polygon",
              "coordinates": [
                [[108.2,16.05],[108.21,16.05],
                 [108.21,16.06],[108.2,16.06]]
              ]
            }
        """.trimIndent()

        enqueue(
            response(
                feature("admin:open", geometry = badGeometry),
                total = 1
            )
        )

        val snapshot = successful(fetch())

        assertTrue(snapshot.zones.isEmpty())
        assertEquals(1, snapshot.skippedFeatures)
        assertTrue(snapshot.incompleteForDisplay)
    }

    @Test
    fun skipsOutOfRangeCoordinates() {
        val badGeometry = """
            {
              "type": "Polygon",
              "coordinates": [
                [[181,16.05],[181,16.06],
                 [179,16.06],[181,16.05]]
              ]
            }
        """.trimIndent()

        enqueue(
            response(
                feature("admin:bad-coord", geometry = badGeometry),
                total = 1
            )
        )

        val snapshot = successful(fetch())

        assertTrue(snapshot.zones.isEmpty())
        assertEquals(1, snapshot.skippedFeatures)
    }

    @Test
    fun doesNotDrawDuplicateZoneIdTwice() {
        val features = listOf(
            feature("admin:repeat"),
            feature("admin:repeat")
        ).joinToString(",")

        enqueue(response(features, total = 2))

        val snapshot = successful(fetch())

        assertEquals(1, snapshot.zones.size)
        assertEquals(1, snapshot.skippedFeatures)
        assertTrue(snapshot.incompleteForDisplay)
    }

    @Test
    fun acceptsGenuineEmptyFeatureCollection() {
        enqueue(response("", total = 0))

        val snapshot = successful(fetch())

        assertTrue(snapshot.zones.isEmpty())
        assertEquals(0, snapshot.totalZones)
        assertEquals(0, snapshot.skippedFeatures)
        assertFalse(snapshot.incompleteForDisplay)
    }

    @Test
    fun rejectsWrongFeatureCollectionType() {
        enqueue(
            response(
                feature("admin:a"),
                total = 1,
                geojsonType = "GeometryCollection"
            )
        )

        assertEquals(
            RescueWarningV2FailureKind.INVALID_RESPONSE,
            failed(fetch())
        )
    }

    @Test
    fun rejectsMissingRequiredCoverage() {
        enqueue(
            response(
                feature("admin:a"),
                total = 1,
                diagnostics = "null"
            )
        )

        assertEquals(
            RescueWarningV2FailureKind.INVALID_RESPONSE,
            failed(fetch())
        )
    }

    @Test
    fun rejectsImpossibleCoverageCounts() {
        enqueue(
            response(
                feature("admin:a"),
                total = 1,
                evaluable = 2
            )
        )

        assertEquals(
            RescueWarningV2FailureKind.INVALID_RESPONSE,
            failed(fetch())
        )
    }

    @Test
    fun distinguishesAuthenticationPermissionAndServerErrors() {
        enqueue("{}", status = 401)
        enqueue("{}", status = 403)
        enqueue("{}", status = 503)

        assertEquals(
            RescueWarningV2FailureKind.UNAUTHORIZED,
            failed(fetch())
        )
        assertEquals(
            RescueWarningV2FailureKind.FORBIDDEN,
            failed(fetch())
        )
        assertEquals(
            RescueWarningV2FailureKind.SERVER,
            failed(fetch())
        )
    }

    @Test
    fun rejectsMissingResponseDataInsteadOfShowingEmptyMap() {
        enqueue("""{"success":true,"data":null}""")

        assertEquals(
            RescueWarningV2FailureKind.INVALID_RESPONSE,
            failed(fetch())
        )
    }
}
