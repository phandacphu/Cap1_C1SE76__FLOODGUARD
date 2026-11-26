package com.example.floodguard.data.repository

import com.example.floodguard.data.model.RescueFloodWarningsV2ZonesResponse
import com.example.floodguard.data.remote.api.RescueFloodWarningV2Api
import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParseException
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.CancellationException
import retrofit2.Response
import kotlin.math.abs

data class RescueWarningZonePoint(
    val latitude: Double,
    val longitude: Double
)

data class RescueWarningZonePolygon(
    val outer: List<RescueWarningZonePoint>,
    val holes: List<List<RescueWarningZonePoint>>
)

data class RescueWarningMapZone(
    val id: String,
    val group: String,
    val name: String?,
    val sourceKind: String?,
    val source: String?,
    val polygons: List<RescueWarningZonePolygon>
)

data class RescueWarningZoneDiagnostic(
    val zoneId: String?,
    val reason: String?,
    val sourceKind: String?
)

data class RescueWarningZonesSnapshot(
    val revision: String,
    val generatedAt: Instant,
    val coverageStatus: String,
    val totalZones: Int,
    val evaluableZones: Int,
    val diagnostics: List<RescueWarningZoneDiagnostic>,
    val zones: List<RescueWarningMapZone>,
    val skippedFeatures: Int
) {
    val incompleteForDisplay: Boolean
        get() = coverageStatus != "complete" ||
            diagnostics.isNotEmpty() ||
            skippedFeatures > 0 ||
            zones.size < totalZones
}

class RescueFloodWarningV2ZonesRepository(
    private val api: RescueFloodWarningV2Api
) {
    suspend fun getZones():
        RescueWarningV2Result<RescueWarningZonesSnapshot> {
        return try {
            parse(api.getZones())
        } catch (error: CancellationException) {
            throw error
        } catch (error: JsonParseException) {
            invalid()
        } catch (error: IOException) {
            RescueWarningV2Result.Failure(
                RescueWarningV2FailureKind.NETWORK,
                "Không thể kết nối máy chủ để tải vùng."
            )
        } catch (error: Exception) {
            invalid()
        }
    }

    private fun parse(
        response: Response<RescueFloodWarningsV2ZonesResponse>
    ): RescueWarningV2Result<RescueWarningZonesSnapshot> {
        if (!response.isSuccessful) {
            val code = response.code()
            val kind = when (code) {
                401 -> RescueWarningV2FailureKind.UNAUTHORIZED
                403 -> RescueWarningV2FailureKind.FORBIDDEN
                404 -> RescueWarningV2FailureKind.NOT_FOUND
                in 500..599 -> RescueWarningV2FailureKind.SERVER
                else -> RescueWarningV2FailureKind.HTTP
            }

            return RescueWarningV2Result.Failure(
                kind,
                "Không thể tải vùng bản đồ (HTTP $code)."
            )
        }

        val body = response.body()
        val data = body?.data
            ?: return invalid()

        if (body.success != true) return invalid()

        val revision = data.zonesRevision
            ?.takeIf { it.isNotBlank() }
            ?: return invalid()

        val generatedAt = data.generatedAt
            ?.takeIf { it.endsWith("Z") }
            ?.let { runCatching { Instant.parse(it) }.getOrNull() }
            ?: return invalid()

        val coverage = data.coverage
            ?: return invalid()

        val coverageStatus = coverage.status
            ?.takeIf { it in setOf("complete", "partial", "unavailable") }
            ?: return invalid()

        val total = coverage.totalZones
            ?.takeIf { it >= 0 }
            ?: return invalid()

        val evaluable = coverage.evaluableZones
            ?.takeIf { it in 0..total }
            ?: return invalid()

        val diagnosticsJson = coverage.unassessableZones
            ?.takeIf { it.isJsonArray }
            ?.asJsonArray
            ?: return invalid()

        val diagnostics = mutableListOf<RescueWarningZoneDiagnostic>()

        for (entry in diagnosticsJson) {
            if (!entry.isJsonObject) return invalid()

            val obj = entry.asJsonObject
            diagnostics.add(
                RescueWarningZoneDiagnostic(
                    zoneId = obj.optionalString("zoneId"),
                    reason = obj.optionalString("reason"),
                    sourceKind = obj.optionalString("sourceKind")
                )
            )
        }

        val geojson = data.geojson
            ?: return invalid()

        if (geojson.type != "FeatureCollection") return invalid()

        val features = geojson.features
            ?: return invalid()

        val zones = mutableListOf<RescueWarningMapZone>()
        val ids = mutableSetOf<String>()
        var skipped = 0

        for (feature in features) {
            val props = feature?.properties

            if (feature?.type != "Feature" || props == null) {
                skipped++
                continue
            }

            val id = props.zoneId
            val group = props.group
            val geometryStatus = props.geometryStatus

            val supportedGroup = group in setOf(
                "current_flood",
                "historical_flood",
                "low_lying"
            )

            if (
                id.isNullOrBlank() ||
                !supportedGroup ||
                geometryStatus != "valid" ||
                feature.geometry == null
            ) {
                skipped++
                continue
            }

            val polygons = parseZoneGeometry(feature.geometry)

            if (polygons.isNullOrEmpty() || !ids.add(id)) {
                skipped++
                continue
            }

            zones.add(
                RescueWarningMapZone(
                    id = id,
                    group = group ?: return invalid(),
                    name = props.name?.takeIf { it.isNotBlank() },
                    sourceKind = props.sourceKind,
                    source = props.source,
                    polygons = polygons
                )
            )
        }

        return RescueWarningV2Result.Success(
            RescueWarningZonesSnapshot(
                revision = revision,
                generatedAt = generatedAt,
                coverageStatus = coverageStatus,
                totalZones = total,
                evaluableZones = evaluable,
                diagnostics = diagnostics,
                zones = zones,
                skippedFeatures = skipped
            )
        )
    }

    private fun invalid() = RescueWarningV2Result.Failure(
        RescueWarningV2FailureKind.INVALID_RESPONSE,
        "Dữ liệu vùng cảnh báo V2 không hợp lệ."
    )
}

private fun JsonObject.optionalString(key: String): String? {
    val value = get(key) ?: return null
    if (!value.isJsonPrimitive || !value.asJsonPrimitive.isString) {
        return null
    }
    return value.asString
}

private fun parseZoneGeometry(
    geometry: JsonElement
): List<RescueWarningZonePolygon>? = runCatching {
    val obj = geometry.asJsonObject
    val coordinates = obj.getAsJsonArray("coordinates")

    when (obj.get("type")?.asString) {
        "Polygon" -> {
            listOf(parseZonePolygon(coordinates) ?: return@runCatching null)
        }
        "MultiPolygon" -> {
            if (coordinates.size() == 0) return@runCatching null

            val result = mutableListOf<RescueWarningZonePolygon>()
            for (polygon in coordinates) {
                result.add(
                    parseZonePolygon(polygon.asJsonArray)
                        ?: return@runCatching null
                )
            }
            result
        }
        else -> null
    }
}.getOrNull()

private fun parseZonePolygon(
    rings: JsonArray
): RescueWarningZonePolygon? {
    if (rings.size() == 0) return null

    val parsed = mutableListOf<List<RescueWarningZonePoint>>()

    for (ring in rings) {
        if (!ring.isJsonArray) return null
        parsed.add(parseZoneRing(ring.asJsonArray) ?: return null)
    }

    return RescueWarningZonePolygon(
        outer = parsed.first(),
        holes = parsed.drop(1)
    )
}

private fun parseZoneRing(
    coordinates: JsonArray
): List<RescueWarningZonePoint>? {
    if (coordinates.size() < 4 || coordinates.size() > 100001) {
        return null
    }

    val points = mutableListOf<RescueWarningZonePoint>()

    for (entry in coordinates) {
        if (!entry.isJsonArray) return null

        val pair = entry.asJsonArray
        if (pair.size() < 2) return null

        val lonValue = pair[0]
        val latValue = pair[1]

        if (
            !lonValue.isJsonPrimitive ||
            !lonValue.asJsonPrimitive.isNumber ||
            !latValue.isJsonPrimitive ||
            !latValue.asJsonPrimitive.isNumber
        ) return null

        val longitude = lonValue.asDouble
        val latitude = latValue.asDouble

        if (
            !longitude.isFinite() ||
            !latitude.isFinite() ||
            longitude !in -180.0..180.0 ||
            latitude !in -90.0..90.0
        ) return null

        points.add(RescueWarningZonePoint(latitude, longitude))
    }

    if (points.first() != points.last()) return null

    if (points.dropLast(1).distinct().size < 3) return null

    var area = 0.0
    for (i in 0 until points.lastIndex) {
        val a = points[i]
        val b = points[i + 1]
        area += a.longitude * b.latitude - b.longitude * a.latitude
    }

    if (abs(area) <= 1e-12) return null

    return points
}
