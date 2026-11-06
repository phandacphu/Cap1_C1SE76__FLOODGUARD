package com.example.floodguard.ui.screens.rescue

import com.example.floodguard.data.model.FloodAlertDto
import com.example.floodguard.data.model.FloodAreaDto
import com.example.floodguard.data.model.FloodGeometryDto
import com.example.floodguard.data.model.FloodPointDto
import com.google.gson.Gson
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RescueFloodMapLayersTest {
    private val triangle = listOf(
        FloodPointDto(16.00, 108.00), FloodPointDto(16.02, 108.00), FloodPointDto(16.00, 108.03)
    )

    @Test
    fun `preserves boundary source and description from API`() {
        val result = buildRescueFloodMapLayers(listOf(area()))
        assertEquals(0, result.skippedCount)
        val mapped = result.areas.single()
        assertEquals(triangle.map { RescueFloodVertex(it.latitude, it.longitude) }, mapped.vertices)
        assertEquals("Nguồn kiểm thử", mapped.source)
        assertEquals("Mô tả từ API", mapped.description)
        assertEquals(RescueAreaType.FLOOD, mapped.areaType)
    }

    @Test
    fun `rejects whole polygon when a coordinate is invalid instead of moving boundary`() {
        val invalid = listOf(
            FloodPointDto(Double.NaN, 108.0), FloodPointDto(16.0, Double.POSITIVE_INFINITY),
            FloodPointDto(91.0, 108.0), FloodPointDto(16.0, -181.0)
        ).mapIndexed { index, point -> area("bad$index", points = triangle + point) }
        val result = buildRescueFloodMapLayers(invalid + area("valid"))
        assertEquals(listOf("valid"), result.areas.map { it.id })
        assertEquals(4, result.skippedCount)
    }

    @Test
    fun `rejects unsupported geometry insufficient unique vertices and collinear points`() {
        val result = buildRescueFloodMapLayers(listOf(
            area("point").copy(geometry = FloodGeometryDto("point", triangle)),
            area("short", points = triangle.take(2)),
            area("repeat", points = listOf(triangle[0], triangle[1], triangle[0])),
            area("line", points = listOf(FloodPointDto(0.0, 0.0), FloodPointDto(1.0, 1.0), FloodPointDto(2.0, 2.0)))
        ))
        assertTrue(result.areas.isEmpty())
        assertEquals(4, result.skippedCount)
    }

    @Test
    fun `accepts closed polygon and removes only redundant closing or adjacent vertices`() {
        val result = buildRescueFloodMapLayers(listOf(area(points =
            listOf(triangle[0], triangle[0], triangle[1], triangle[2], triangle[0])
        )))
        assertEquals(triangle.map { RescueFloodVertex(it.latitude, it.longitude) }, result.areas.single().vertices)
    }

    @Test
    fun `valid zero coordinates and coordinate limits are retained`() {
        val result = buildRescueFloodMapLayers(listOf(area(points = listOf(
            FloodPointDto(0.0, 0.0), FloodPointDto(90.0, 180.0), FloodPointDto(-90.0, 180.0)
        ))))
        assertEquals(3, result.areas.single().vertices.size)
    }

    @Test
    fun `malformed Gson records cannot crash map or replace missing source with invented data`() {
        val missingGeometry = Gson().fromJson("""{"id":"broken","areaType":"flood"}""", FloodAreaDto::class.java)
        val missingPoint = Gson().fromJson(
            """{"id":"bad-point","areaType":"flood","geometry":{"type":"polygon","points":[null]}}""",
            FloodAreaDto::class.java
        )
        val result = buildRescueFloodMapLayers(listOf(null, missingGeometry, missingPoint, area().copy(source = " ", description = null)))
        assertEquals(3, result.skippedCount)
        assertEquals("Chưa có thông tin nguồn.", result.areas.single().source)
        assertEquals("Chưa có mô tả.", result.areas.single().description)
    }

    @Test
    fun `blank and duplicate identifiers cannot select the wrong region`() {
        val result = buildRescueFloodMapLayers(listOf(area(" "), area("a"), area("a").copy(name = "Duplicate")))
        assertEquals(2, result.skippedCount)
        assertEquals("Vùng kiểm thử", result.areas.single().name)
    }

    @Test
    fun `area classification ignores legacy status and severity`() {
        val result = buildRescueFloodMapLayers(listOf(
            area("flood").copy(status = "inactive", severity = "critical"),
            area("low-lying", areaType = "low_lying").copy(status = "unexpected", severity = "low")
        ))
        assertEquals(listOf("flood", "low-lying"), result.areas.map { it.id })
        assertEquals(RescueAreaType.FLOOD, result.areas[0].areaType)
        assertEquals(RescueAreaType.LOW_LYING, result.areas[1].areaType)
    }

    @Test
    fun `new API JSON without status or severity maps to required categories and colors`() {
        val regions = listOf("flood", "low_lying").map { type ->
            Gson().fromJson("""{
              "id":"$type","name":"Vùng từ API","description":"Mô tả thật","source":"Admin",
              "areaType":"$type",
              "geometry":{"type":"polygon","points":[
                {"latitude":16.0,"longitude":108.0},
                {"latitude":16.02,"longitude":108.0},
                {"latitude":16.0,"longitude":108.03}
              ]}
            }""", FloodAreaDto::class.java)
        }
        val result = buildRescueFloodMapLayers(regions)
        assertEquals(0, result.skippedCount)
        assertEquals(0, result.unclassifiedCount)
        assertEquals(0, result.legacyFormatCount)
        val flood = result.areas[0]
        val lowLying = result.areas[1]
        assertEquals("Vùng ngập", flood.areaType.label)
        assertEquals(0xFFFDD835L, flood.areaType.colorArgb)
        assertEquals("Vùng trũng", lowLying.areaType.label)
        assertEquals(0xFFE53935L, lowLying.areaType.colorArgb)
        assertEquals(0.32f, lowLying.areaType.fillAlpha, 0.001f)
        assertEquals("Mô tả thật", lowLying.description)
    }

    @Test
    fun `unclassified records never get an inferred type from legacy fields`() {
        val unknown = listOf(null, "", "future", "FLOOD", " flood ").mapIndexed { index, type ->
            area("unknown-$index", areaType = type).copy(status = "active", severity = "high")
        }
        val result = buildRescueFloodMapLayers(unknown + area("valid"))
        assertEquals(listOf("valid"), result.areas.map { it.id })
        assertEquals(5, result.unclassifiedCount)
        assertEquals(0, result.skippedCount)
    }

    @Test
    fun `old JSON with no areaType is reported as unclassified`() {
        val old = Gson().fromJson("""{
          "id":"old","name":"Bản ghi cũ","source":"Admin","status":"active","severity":"high",
          "geometry":{"type":"polygon","points":[
            {"latitude":16.0,"longitude":108.0},
            {"latitude":16.02,"longitude":108.0},
            {"latitude":16.0,"longitude":108.03}
          ]}
        }""", FloodAreaDto::class.java)
        val result = buildRescueFloodMapLayers(listOf(old))
        assertTrue(result.areas.isEmpty())
        assertEquals(1, result.unclassifiedCount)
        assertEquals(0, result.skippedCount)
        assertEquals(1, result.legacyFormatCount)
    }

    @Test
    fun `new API unclassified records are distinct from legacy contract mismatches`() {
        val current = Gson().fromJson("""{
          "id":"current-unclassified","areaType":null,"name":"Vùng chờ phân loại",
          "geometry":{"type":"polygon","points":[
            {"latitude":16.0,"longitude":108.0},
            {"latitude":16.02,"longitude":108.0},
            {"latitude":16.0,"longitude":108.03}
          ]}
        }""", FloodAreaDto::class.java)
        val legacy = area("legacy", areaType = null)
        val result = buildRescueFloodMapLayers(listOf(current, legacy, area("valid")))
        assertEquals(listOf("valid"), result.areas.map { it.id })
        assertEquals(2, result.unclassifiedCount)
        assertEquals(1, result.legacyFormatCount)
        assertEquals(0, result.skippedCount)
    }

    @Test
    fun `links only active alerts by exact area ID and orders by provided severity`() {
        val warnings = listOf(
            warning("low", "a", "low"), warning("critical", "a", "critical"),
            warning("other", "b", "critical"), warning("old", "a", "high").copy(status = "inactive")
        )
        assertEquals(listOf("critical", "low"), rescueWarningsForArea(warnings, "a").map { it.id })
        assertTrue(rescueWarningsForArea(warnings, "missing").isEmpty())
    }

    @Test
    fun `severity mapping does not invent a supported level for unknown input`() {
        assertEquals(RescueFloodSeverity.LOW, RescueFloodSeverity.from("low"))
        assertEquals(RescueFloodSeverity.MEDIUM, RescueFloodSeverity.from("medium"))
        assertEquals(RescueFloodSeverity.HIGH, RescueFloodSeverity.from(" HIGH "))
        assertEquals(RescueFloodSeverity.CRITICAL, RescueFloodSeverity.from("critical"))
        assertEquals(RescueFloodSeverity.UNKNOWN, RescueFloodSeverity.from(null))
        assertEquals(RescueFloodSeverity.UNKNOWN, RescueFloodSeverity.from("extreme"))
    }

    @Test
    fun `formats API time with explicit device zone and handles missing or invalid dates`() {
        assertEquals("04/11/2026 20:00 +07:00", formatRescueWarningTime("2026-11-04T13:00:00Z", ZoneId.of("Asia/Ho_Chi_Minh")))
        assertEquals("Chưa cung cấp", formatRescueWarningTime(null))
        assertEquals("Thời gian không hợp lệ", formatRescueWarningTime("not-a-date"))
    }

    private fun area(id: String = "a", points: List<FloodPointDto> = triangle, areaType: String? = "flood") = FloodAreaDto(
        id = id, name = "Vùng kiểm thử", description = "Mô tả từ API",
        geometry = FloodGeometryDto("polygon", points), severity = "high", status = "active", source = "Nguồn kiểm thử",
        areaType = areaType
    )

    private fun warning(id: String, areaId: String, severity: String) = FloodAlertDto(
        id = id, title = "Cảnh báo kiểm thử", content = "Nội dung từ API", severity = severity,
        status = "active", areaId = areaId, startAt = "2026-11-04T13:00:00Z", endAt = null
    )
}
