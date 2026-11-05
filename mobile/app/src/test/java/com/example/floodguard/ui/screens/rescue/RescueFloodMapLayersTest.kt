package com.example.floodguard.ui.screens.rescue

import com.example.floodguard.data.model.FloodAlertDto
import com.example.floodguard.data.model.FloodAreaDto
import com.example.floodguard.data.model.FloodGeometryDto
import com.example.floodguard.data.model.FloodPointDto
import com.google.gson.Gson
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        assertEquals(RescueFloodSeverity.HIGH, mapped.severity)
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
        val missingGeometry = Gson().fromJson("""{"id":"broken"}""", FloodAreaDto::class.java)
        val missingPoint = Gson().fromJson(
            """{"id":"bad-point","geometry":{"type":"polygon","points":[null]}}""",
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
    fun `inactive and unknown statuses remain distinguishable from active areas`() {
        val result = buildRescueFloodMapLayers(listOf(
            area("off").copy(status = "inactive", severity = "critical"),
            area("unknown").copy(status = "unexpected", severity = "future"),
            area("low").copy(severity = "low"), area("critical").copy(severity = "critical")
        ))
        assertEquals(listOf("critical", "low"), result.areas.take(2).map { it.id })
        assertFalse(result.areas.first { it.id == "off" }.isActive)
        val unknown = result.areas.first { it.id == "unknown" }
        assertEquals(RescueFloodSeverity.UNKNOWN, unknown.severity)
        assertEquals("Chưa xác định trạng thái", unknown.statusLabel)
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

    private fun area(id: String = "a", points: List<FloodPointDto> = triangle) = FloodAreaDto(
        id = id, name = "Vùng kiểm thử", description = "Mô tả từ API",
        geometry = FloodGeometryDto("polygon", points), severity = "high", status = "active", source = "Nguồn kiểm thử"
    )

    private fun warning(id: String, areaId: String, severity: String) = FloodAlertDto(
        id = id, title = "Cảnh báo kiểm thử", content = "Nội dung từ API", severity = severity,
        status = "active", areaId = areaId, startAt = "2026-11-04T13:00:00Z", endAt = null
    )
}
