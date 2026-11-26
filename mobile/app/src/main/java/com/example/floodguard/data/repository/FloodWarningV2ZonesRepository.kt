package com.example.floodguard.data.repository

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import retrofit2.Response
import retrofit2.http.GET

interface FloodWarningV2ZonesApi {
    @GET("api/flood-alerts/zones")
    suspend fun getZones(): Response<JsonObject>
}

enum class WarningZoneGroup(val label: String) {
    CURRENT_FLOOD("Ngập hiện tại"),
    HISTORICAL_FLOOD("Ngập lịch sử"),
    LOW_LYING("Vùng trũng")
}

data class WarningZoneCoordinate(
    val latitude: Double,
    val longitude: Double
)

data class WarningZonePolygon(
    val outer: List<WarningZoneCoordinate>,
    val holes: List<List<WarningZoneCoordinate>>
)

data class WarningZoneDiagnostic(
    val reason: String,
    val sourceKind: String?,
    val zoneId: String?
)

data class WarningZoneCoverage(
    val status: String,
    val totalZones: Int,
    val evaluableZones: Int,
    val unassessableZones: List<WarningZoneDiagnostic>
)

data class WarningZone(
    val id: String,
    val group: WarningZoneGroup?,
    val name: String?,
    val sourceKind: String,
    val sourceId: String?,
    val source: String?,
    val recordedAt: String?,
    val dataUpdatedAt: String?,
    val datasetVersion: String?,
    val geometryStatus: String,
    val polygons: List<WarningZonePolygon>
) {
    val displayName: String
        get() = name?.takeIf { it.isNotBlank() }
            ?: group?.label
            ?: "Vùng chưa phân loại"
}

data class WarningZoneCollection(
    val zonesRevision: String,
    val generatedAt: String,
    val coverage: WarningZoneCoverage,
    val zones: List<WarningZone>
)

class FloodWarningV2ZonesRepository(
    private val api: FloodWarningV2ZonesApi
) {
    suspend fun getZones(): Result<WarningZoneCollection> {
        return try {
            val response = api.getZones()
            if (!response.isSuccessful) throw HttpException(response)

            val body = requireNotNull(response.body()) {
                "API vùng không có nội dung."
            }

            val collection = withContext(Dispatchers.Default) {
                parseWarningV2Zones(body)
            }
            Result.success(collection)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.failure(error)
        }
    }
}

/*
 * Chỉ đọc hình học đã được Backend chuẩn hóa.
 * Không tạo polygon từ Point, buffer hoặc tự suy luận nhóm vùng.
 * Kiểm tra topology thuộc Backend; client kiểm tra cấu trúc để vẽ.
 */
internal fun parseWarningV2Zones(
    root: JsonObject
): WarningZoneCollection {
    val success = root.get("success")
    require(
        success != null &&
                success.isJsonPrimitive &&
                success.asJsonPrimitive.isBoolean &&
                success.asBoolean
    ) { "API vùng chưa trả kết quả thành công." }

    val data = root.requiredObject("data")
    val coverageJson = data.requiredObject("coverage")

    val coverageStatus = coverageJson.requiredText("status")
    require(coverageStatus in setOf("complete", "partial", "unavailable"))

    val coverage = WarningZoneCoverage(
        status = coverageStatus,
        totalZones = coverageJson.requiredCount("totalZones"),
        evaluableZones = coverageJson.requiredCount("evaluableZones"),
        unassessableZones = coverageJson
            .requiredArray("unassessableZones")
            .map { element ->
                val diagnostic = element.requiredObjectValue()
                WarningZoneDiagnostic(
                    reason = diagnostic.requiredText("reason"),
                    sourceKind = diagnostic.optionalText("sourceKind"),
                    zoneId = diagnostic.optionalText("zoneId")
                )
            }
    )

    require(coverage.evaluableZones <= coverage.totalZones)
    if (coverage.status == "complete") {
        require(coverage.evaluableZones == coverage.totalZones)
        require(coverage.unassessableZones.isEmpty())
    }

    val geojson = data.requiredObject("geojson")
    require(geojson.requiredText("type") == "FeatureCollection")

    val zones = geojson.requiredArray("features").map { element ->
        val feature = element.requiredObjectValue()
        require(feature.requiredText("type") == "Feature")

        val properties = feature.requiredObject("properties")
        val group = when (properties.optionalText("group")) {
            "current_flood" -> WarningZoneGroup.CURRENT_FLOOD
            "historical_flood" -> WarningZoneGroup.HISTORICAL_FLOOD
            "low_lying" -> WarningZoneGroup.LOW_LYING
            null -> null
            else -> error("Nhóm vùng không được hỗ trợ.")
        }

        val geometryStatus = properties.requiredText("geometryStatus")
        require(geometryStatus in setOf("valid", "missing", "invalid"))

        require(feature.has("geometry")) {
            "Feature thiếu trường geometry."
        }
        val geometry = feature.get("geometry")

        val polygons = if (geometryStatus == "valid") {
            require(group != null && !geometry.isJsonNull)
            readWarningPolygons(geometry.requiredObjectValue())
        } else {
            require(geometry.isJsonNull) {
                "Vùng chưa đủ hình học phải có geometry=null."
            }
            emptyList()
        }

        WarningZone(
            id = properties.requiredText("zoneId"),
            group = group,
            name = properties.optionalText("name"),
            sourceKind = properties.requiredText("sourceKind"),
            sourceId = properties.optionalText("sourceId"),
            source = properties.optionalText("source"),
            recordedAt = properties.optionalText("recordedAt"),
            dataUpdatedAt = properties.optionalText("dataUpdatedAt"),
            datasetVersion = properties.optionalText("datasetVersion"),
            geometryStatus = geometryStatus,
            polygons = polygons
        )
    }

    require(zones.map { it.id }.distinct().size == zones.size) {
        "Bộ vùng có zoneId trùng."
    }
    require(zones.size == coverage.totalZones) {
        "Số vùng không khớp coverage."
    }
    require(zones.count { it.geometryStatus == "valid" } == coverage.evaluableZones) {
        "Số vùng có hình học không khớp coverage."
    }
    if (coverage.status == "unavailable") {
        require(coverage.evaluableZones == 0)
    }

    return WarningZoneCollection(
        zonesRevision = data.requiredText("zonesRevision"),
        generatedAt = data.requiredText("generatedAt"),
        coverage = coverage,
        zones = zones
    )
}

private fun readWarningPolygons(
    geometry: JsonObject
): List<WarningZonePolygon> {
    val coordinates = geometry.requiredArray("coordinates")
    val polygons = when (geometry.requiredText("type")) {
        "Polygon" -> listOf(readWarningPolygon(coordinates))
        "MultiPolygon" -> coordinates.map {
            require(it.isJsonArray)
            readWarningPolygon(it.asJsonArray)
        }
        else -> error("Chỉ hỗ trợ Polygon và MultiPolygon từ bộ vùng V2.")
    }

    require(polygons.isNotEmpty())
    val vertexCount = polygons.sumOf { polygon ->
        polygon.outer.size.toLong() +
                polygon.holes.sumOf { it.size.toLong() }
    }
    require(vertexCount <= 100_000L)

    return polygons
}

private fun readWarningPolygon(
    rings: JsonArray
): WarningZonePolygon {
    require(rings.size() > 0)

    val parsed = rings.map { element ->
        require(element.isJsonArray)
        val ring = element.asJsonArray.map { position ->
            require(position.isJsonArray)
            val values = position.asJsonArray
            require(values.size() >= 2)

            val longitude = values[0].requiredNumber()
            val latitude = values[1].requiredNumber()
            require(longitude in -180.0..180.0)
            require(latitude in -90.0..90.0)

            WarningZoneCoordinate(
                latitude = latitude,
                longitude = longitude
            )
        }

        require(ring.size >= 4)
        require(ring.first() == ring.last()) {
            "Ring chưa đóng; client không tự sửa hình học."
        }
        require(ring.dropLast(1).distinct().size >= 3)
        require(ring.zipWithNext().all { (a, b) ->
            kotlin.math.abs(a.longitude - b.longitude) <= 180.0
        })

        ring
    }

    return WarningZonePolygon(
        outer = parsed.first(),
        holes = parsed.drop(1)
    )
}

private fun JsonObject.requiredObject(key: String): JsonObject =
    requireNotNull(get(key)) { "Thiếu $key." }.requiredObjectValue()

private fun JsonElement.requiredObjectValue(): JsonObject {
    require(isJsonObject)
    return asJsonObject
}

private fun JsonObject.requiredArray(key: String): JsonArray {
    val value = requireNotNull(get(key)) { "Thiếu $key." }
    require(value.isJsonArray)
    return value.asJsonArray
}

private fun JsonObject.optionalText(key: String): String? {
    val value = get(key) ?: return null
    if (value.isJsonNull) return null
    require(value.isJsonPrimitive && value.asJsonPrimitive.isString)
    return value.asString
}

private fun JsonObject.requiredText(key: String): String =
    requireNotNull(optionalText(key)) { "Thiếu $key." }.also {
        require(it.isNotBlank()) { "$key không được rỗng." }
    }

private fun JsonElement.requiredNumber(): Double {
    require(isJsonPrimitive && asJsonPrimitive.isNumber)
    return asDouble.also { require(it.isFinite()) }
}

private fun JsonObject.requiredCount(key: String): Int {
    val value = requireNotNull(get(key)) { "Thiếu $key." }
        .requiredNumber()
    require(value >= 0 && value <= Int.MAX_VALUE.toDouble())
    require(value % 1.0 == 0.0)
    return value.toInt()
}