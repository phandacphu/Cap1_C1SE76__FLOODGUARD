package com.example.floodguard.ui.screens.map

import com.example.floodguard.data.model.FloodAreasResponse
import com.google.gson.Gson
import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CitizenFloodAreaMapperTest {

    @Test
    fun flood_withoutStatusAndSeverity_mapsSuccessfully() {
        val result = mapResponse("flood")
        val area = result.areas.single()

        assertEquals(CitizenAreaType.FLOOD, area.areaType)
        assertEquals("isolated-area-1", area.id)
        assertEquals("Vùng kiểm thử độc lập", area.name)
        assertEquals("Mô tả kiểm thử", area.description)
        assertEquals("unit-test", area.source)
        assertEquals(0, result.unsupportedTypeCount)
        assertEquals(0, result.invalidRecordCount)

        assertEquals(
            listOf(
                CitizenAreaVertex(16.0, 108.0),
                CitizenAreaVertex(16.0, 108.01),
                CitizenAreaVertex(16.01, 108.01),
                CitizenAreaVertex(16.0, 108.0)
            ),
            area.vertices
        )
    }

    @Test
    fun lowLying_withoutStatusAndSeverity_mapsSuccessfully() {
        val result = mapResponse("low_lying")
        val area = result.areas.single()

        assertEquals(CitizenAreaType.LOW_LYING, area.areaType)
        assertEquals("isolated-area-1", area.id)
        assertEquals(4, area.vertices.size)
        assertEquals(0, result.unsupportedTypeCount)
        assertEquals(0, result.invalidRecordCount)
    }

    @Test
    fun unknownAreaType_isReportedWithoutDefaulting() {
        val result = mapResponse("unsupported_type")

        assertTrue(result.areas.isEmpty())
        assertEquals(1, result.unsupportedTypeCount)
        assertEquals(0, result.invalidRecordCount)
    }

    @Test
    fun oldResponse_withoutAreaType_isReportedWithoutDefaulting() {
        val result = mapResponse(
            areaType = null,
            includeLegacyFields = true
        )

        assertTrue(result.areas.isEmpty())
        assertEquals(1, result.unsupportedTypeCount)
        assertEquals(0, result.invalidRecordCount)
    }

    private fun mapResponse(
        areaType: String?,
        includeLegacyFields: Boolean = false
    ): CitizenAreaMappingResult {
        val json = JsonParser.parseString(
            """
            {
              "success": true,
              "message": "Unit test fixture",
              "data": {
                "floodAreas": [
                  {
                    "id": "isolated-area-1",
                    "name": "Vùng kiểm thử độc lập",
                    "description": "Mô tả kiểm thử",
                    "source": "unit-test",
                    "geometry": {
                      "type": "polygon",
                      "points": [
                        {"latitude": 16.0, "longitude": 108.0},
                        {"latitude": 16.0, "longitude": 108.01},
                        {"latitude": 16.01, "longitude": 108.01},
                        {"latitude": 16.0, "longitude": 108.0}
                      ]
                    }
                  }
                ]
              }
            }
            """.trimIndent()
        ).asJsonObject

        val area = json.getAsJsonObject("data")
            .getAsJsonArray("floodAreas")[0]
            .asJsonObject

        if (areaType != null) {
            area.addProperty("areaType", areaType)
        }

        if (includeLegacyFields) {
            area.addProperty("status", "active")
            area.addProperty("severity", "medium")
        }

        val response = Gson().fromJson(
            json,
            FloodAreasResponse::class.java
        )

        return mapCitizenFloodAreas(response.data.floodAreas)
    }
}