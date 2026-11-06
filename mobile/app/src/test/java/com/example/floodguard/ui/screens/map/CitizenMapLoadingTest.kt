package com.example.floodguard.ui.screens.map

import com.example.floodguard.data.model.*
import com.example.floodguard.data.remote.api.*
import com.example.floodguard.data.repository.*
import com.google.gson.Gson
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class CitizenMapLoadingTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(
        apis: FakeCitizenMapApis
    ): FloodMapViewModel {
        return FloodMapViewModel(
            floodAreaRepository = FloodAreaRepository(apis.areaApi),
            floodAlertRepository = FloodAlertRepository(apis.alertApi),
            safeLocationRepository = SafeLocationRepository(apis.safeApi),
            floodHistoryRepository = FloodHistoryRepository(apis.historyApi),
            parsingDispatcher = dispatcher
        )
    }

    @Test
    fun areaFailure_thenRetry_preservesOtherSources() = runTest(dispatcher) {
        val apis = FakeCitizenMapApis()
        apis.areaHttpCode = 503

        val vm = createViewModel(apis)
        advanceUntilIdle()

        val failed = vm.uiState.value
        assertNotNull(failed.floodAreasError)
        assertFalse(failed.isLoadingFloodAreas)
        assertEquals(1, failed.historyPoints.size)
        assertEquals(1, failed.safeLocations.size)
        assertNull(failed.historyPointsError)
        assertNull(failed.safeLocationsError)
        assertNull(failed.floodAlertsError)

        apis.areaHttpCode = 200
        vm.loadFloodAreas()
        advanceUntilIdle()

        val recovered = vm.uiState.value
        assertNull(recovered.floodAreasError)
        assertEquals(1, recovered.citizenAreas.size)
        assertEquals(
            CitizenAreaType.FLOOD,
            recovered.citizenAreas.single().areaType
        )
        assertNotNull(recovered.floodAreasLoadedAt)
        assertEquals(listOf(2, 1, 1, 1, 0), apis.counts())
    }

    @Test
    fun refreshFailure_keepsDataAndSuccessfulTimestamps() =
        runTest(dispatcher) {
            val apis = FakeCitizenMapApis()
            val vm = createViewModel(apis)
            advanceUntilIdle()

            vm.selectCitizenArea("unit-area-1")
            val before = vm.uiState.value

            assertNotNull(before.floodAreasLoadedAt)
            assertNotNull(before.historyPointsLoadedAt)
            assertNotNull(before.safeLocationsLoadedAt)
            assertNotNull(before.floodAlertsLoadedAt)

            apis.offline = true
            vm.refreshMapData()
            advanceUntilIdle()

            val after = vm.uiState.value

            assertEquals(before.citizenAreas, after.citizenAreas)
            assertEquals(before.historyPoints, after.historyPoints)
            assertEquals(before.safeLocations, after.safeLocations)
            assertEquals(before.floodAlerts, after.floodAlerts)
            assertEquals("unit-area-1", after.selectedCitizenAreaId)

            assertEquals(before.floodAreasLoadedAt, after.floodAreasLoadedAt)
            assertEquals(before.historyPointsLoadedAt, after.historyPointsLoadedAt)
            assertEquals(before.safeLocationsLoadedAt, after.safeLocationsLoadedAt)
            assertEquals(before.floodAlertsLoadedAt, after.floodAlertsLoadedAt)

            assertNotNull(after.floodAreasError)
            assertNotNull(after.historyPointsError)
            assertNotNull(after.safeLocationsError)
            assertNotNull(after.floodAlertsError)

            assertFalse(
                after.historyPointsError.orEmpty()
                    .contains("isolated-offline")
            )
        }

    @Test
    fun repeatedRefreshAndRetry_doNotDuplicateInFlightRequest() =
        runTest(dispatcher) {
            val apis = FakeCitizenMapApis()
            val gate = CompletableDeferred<Unit>()
            apis.areaGate = gate

            val vm = createViewModel(apis)
            runCurrent()

            try {
                assertTrue(vm.uiState.value.isLoadingFloodAreas)
                assertEquals(1, vm.uiState.value.historyPoints.size)
                assertEquals(1, vm.uiState.value.safeLocations.size)

                repeat(20) {
                    vm.refreshMapData()
                    vm.loadFloodAreas()
                }
                runCurrent()

                assertEquals(listOf(1, 1, 1, 1, 0), apis.counts())
            } finally {
                gate.complete(Unit)
            }

            advanceUntilIdle()

            assertFalse(vm.uiState.value.isLoadingFloodAreas)
            assertEquals(1, vm.uiState.value.citizenAreas.size)
        }

    @Test
    fun toggles_onlyChangeVisibility_withoutLoadingAgain() =
        runTest(dispatcher) {
            val apis = FakeCitizenMapApis()
            val vm = createViewModel(apis)
            advanceUntilIdle()

            val before = vm.uiState.value
            val countsBefore = apis.counts()

            repeat(10) {
                vm.toggleFloodLayer()
                vm.toggleFloodLayer()
                vm.toggleUserLayer()
                vm.toggleUserLayer()
                vm.toggleShelterLayer()
                vm.toggleShelterLayer()
            }
            advanceUntilIdle()

            assertEquals(countsBefore, apis.counts())
            assertEquals(before.citizenAreas, vm.uiState.value.citizenAreas)
            assertEquals(before.historyPoints, vm.uiState.value.historyPoints)
            assertEquals(before.safeLocations, vm.uiState.value.safeLocations)
        }

    @Test
    fun refresh_updatesAreaType_andClearsDeletedSelection() =
        runTest(dispatcher) {
            val apis = FakeCitizenMapApis()
            val vm = createViewModel(apis)
            advanceUntilIdle()

            assertTrue(vm.uiState.value.floodAlerts.isEmpty())

            vm.selectCitizenArea("unit-area-1")
            assertEquals(
                "unit-area-1",
                vm.uiState.value.selectedCitizenAreaId
            )

            apis.areasJson = UNIT_AREAS_JSON.replace(
                "\"flood\"",
                "\"low_lying\""
            )
            vm.refreshMapData()
            advanceUntilIdle()

            assertEquals(
                CitizenAreaType.LOW_LYING,
                vm.uiState.value.citizenAreas.single().areaType
            )
            assertEquals(
                "unit-area-1",
                vm.uiState.value.selectedCitizenAreaId
            )

            apis.areasJson =
                """{"success":true,"data":{"floodAreas":[]}}"""

            vm.refreshMapData()
            advanceUntilIdle()

            assertTrue(vm.uiState.value.citizenAreas.isEmpty())
            assertNull(vm.uiState.value.selectedCitizenAreaId)
        }

    @Test
    fun shelterRetry_recoversAndSelectsExactId() = runTest(dispatcher) {
        val apis = FakeCitizenMapApis()
        apis.shelterOffline = true

        val vm = createViewModel(apis)
        advanceUntilIdle()

        assertNotNull(vm.uiState.value.safeLocationsError)
        assertEquals(1, vm.uiState.value.citizenAreas.size)
        assertEquals(1, vm.uiState.value.historyPoints.size)

        apis.shelterOffline = false
        vm.loadSafeLocations()
        advanceUntilIdle()

        assertNull(vm.uiState.value.safeLocationsError)
        assertEquals(listOf(1, 1, 2, 1, 0), apis.counts())

        vm.selectSafeLocation("unit-shelter-1")
        assertEquals(
            "unit-shelter-1",
            vm.uiState.value.selectedSafeLocationId
        )

        vm.selectSafeLocation("unknown-id")
        assertNull(vm.uiState.value.selectedSafeLocationId)

        vm.selectSafeLocation("unit-shelter-1")
        vm.toggleShelterLayer()
        assertNull(vm.uiState.value.selectedSafeLocationId)
    }
}

private class FakeCitizenMapApis {
    var offline = false
    var shelterOffline = false
    var areaHttpCode = 200
    var areaGate: CompletableDeferred<Unit>? = null
    var areasJson = UNIT_AREAS_JSON

    private var areaCalls = 0
    private var alertCalls = 0
    private var shelterCalls = 0
    private var pointCalls = 0
    private var researchCalls = 0

    fun counts(): List<Int> = listOf(
        areaCalls,
        alertCalls,
        shelterCalls,
        pointCalls,
        researchCalls
    )

    private fun checkOnline() {
        if (offline) throw IOException("isolated-offline")
    }

    val areaApi = object : FloodAreaApi {
        override suspend fun getFloodAreas(): Response<FloodAreasResponse> {
            areaCalls++
            areaGate?.await()
            checkOnline()

            if (areaHttpCode != 200) {
                return Response.error(
                    areaHttpCode,
                    "unit-http-error".toResponseBody()
                )
            }

            return citizenFixtureResponse(
                areasJson,
                FloodAreasResponse::class.java
            )
        }
    }

    val alertApi = object : FloodAlertApi {
        override suspend fun getFloodAlerts(): Response<FloodAlertsResponse> {
            error("Map phải dùng nguồn cảnh báo đang hiệu lực")
        }

        override suspend fun getActiveFloodAlerts():
                Response<FloodAlertsResponse> {
            alertCalls++
            checkOnline()

            return citizenFixtureResponse(
                """{"success":true,"data":{"floodAlerts":[]}}""",
                FloodAlertsResponse::class.java
            )
        }
    }

    val safeApi = object : SafeLocationApi {
        override suspend fun getSafeLocations():
                Response<SafeLocationsResponse> {
            shelterCalls++
            checkOnline()

            if (shelterOffline) {
                throw IOException("isolated-shelter-offline")
            }

            return citizenFixtureResponse(
                UNIT_SHELTERS_JSON,
                SafeLocationsResponse::class.java
            )
        }

        override suspend fun getNearbySafeLocations(
            latitude: Double,
            longitude: Double,
            radiusKm: Double,
            type: String?
        ): Response<SafeLocationsResponse> {
            error("Map unit test không dùng truy vấn điểm gần nhất")
        }
    }

    val historyApi = object : FloodHistoryApi {
        override suspend fun getPoints(): Response<FloodHistoryResponse> {
            pointCalls++
            checkOnline()

            return citizenFixtureResponse(
                UNIT_HISTORY_JSON,
                FloodHistoryResponse::class.java
            )
        }

        override suspend fun getBuffers(): Response<FloodHistoryResponse> {
            researchCalls++
            error("Lớp chưa xác nhận phân loại không tự tải")
        }

        override suspend fun getRadar(): Response<FloodHistoryResponse> {
            researchCalls++
            error("Lớp chưa xác nhận phân loại không tự tải")
        }
    }
}

private fun <T> citizenFixtureResponse(
    json: String,
    type: Class<T>
): Response<T> {
    return Response.success(Gson().fromJson(json, type))
}

private const val UNIT_AREAS_JSON = """
{
  "success": true,
  "message": "Isolated unit test",
  "data": {
    "floodAreas": [{
      "id": "unit-area-1",
      "name": "Vùng kiểm thử độc lập",
      "description": "Chỉ dùng trong unit test",
      "source": "unit-test",
      "areaType": "flood",
      "geometry": {
        "type": "polygon",
        "points": [
          {"latitude": 16.0, "longitude": 108.0},
          {"latitude": 16.0, "longitude": 108.01},
          {"latitude": 16.01, "longitude": 108.01},
          {"latitude": 16.0, "longitude": 108.0}
        ]
      }
    }]
  }
}
"""

private const val UNIT_SHELTERS_JSON = """
{
  "success": true,
  "data": {
    "safeLocations": [{
      "id": "unit-shelter-1",
      "name": "Điểm tránh trú kiểm thử",
      "address": "Địa chỉ kiểm thử độc lập",
      "location": {"latitude": 16.05, "longitude": 108.2},
      "type": "shelter",
      "capacity": 100,
      "status": "active",
      "services": []
    }]
  }
}
"""

private const val UNIT_HISTORY_JSON = """
{
  "success": true,
  "data": {
    "layer": "points",
    "geojson": {
      "type": "FeatureCollection",
      "features": [{
        "type": "Feature",
        "properties": {
          "id": "HIST-UNIT-1",
          "name": "Điểm lịch sử kiểm thử"
        },
        "geometry": {
          "type": "Point",
          "coordinates": [108.2, 16.05]
        }
      }]
    }
  }
}
"""