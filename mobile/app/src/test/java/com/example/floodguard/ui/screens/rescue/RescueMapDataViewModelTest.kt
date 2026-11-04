package com.example.floodguard.ui.screens.rescue

import com.example.floodguard.data.model.FloodAlertDto
import com.example.floodguard.data.model.FloodAreaDto
import com.example.floodguard.data.model.FloodGeometryDto
import com.example.floodguard.data.model.FloodPointDto
import com.example.floodguard.data.remote.api.FloodAlertApi
import com.example.floodguard.data.remote.api.FloodAreaApi
import com.example.floodguard.data.repository.FloodAlertRepository
import com.example.floodguard.data.repository.FloodAreaRepository
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

@OptIn(ExperimentalCoroutinesApi::class)
class RescueMapDataViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val area = FloodAreaDto(
        id = "area-1", name = "Vùng thử nghiệm", description = null,
        geometry = FloodGeometryDto("Polygon", listOf(
            FloodPointDto(16.0, 108.0), FloodPointDto(16.01, 108.0), FloodPointDto(16.0, 108.01)
        )), severity = "high", status = "active", source = "unit-test"
    )
    private val warning = FloodAlertDto(
        id = "warning-1", title = "Cảnh báo thử nghiệm", content = "Nội dung thử nghiệm",
        severity = "high", status = "active", areaId = "area-1",
        startAt = "2026-11-04T00:00:00.000Z", endAt = "2026-11-05T00:00:00.000Z"
    )

    @Before
    fun setUp() { Dispatchers.setMain(dispatcher) }

    @After
    fun tearDown() { Dispatchers.resetMain() }

    @Test
    fun initialRequestsCompleteIndependently() = runTest(dispatcher) {
        val areaResult = CompletableDeferred<Result<List<FloodAreaDto>>>()
        val vm = RescueMapDataViewModel(
            loadFloodAreas = { areaResult.await() },
            loadActiveWarnings = { Result.success(listOf(warning)) }
        )
        assertTrue(vm.uiState.value.isLoading)
        runCurrent()
        val partial = vm.uiState.value
        areaResult.complete(Result.success(listOf(area)))
        advanceUntilIdle()
        assertTrue(partial.floodAreas is RescueMapLoadState.Loading)
        assertEquals(listOf(warning), data(partial.activeWarnings))
        assertEquals(listOf(area), data(vm.uiState.value.floodAreas))
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun emptyResponsesAreEmptyRatherThanErrors() = runTest(dispatcher) {
        val vm = RescueMapDataViewModel({ Result.success(emptyList()) }, { Result.success(emptyList()) })
        advanceUntilIdle()
        assertEquals(RescueMapLoadState.Empty, vm.uiState.value.floodAreas)
        assertEquals(RescueMapLoadState.Empty, vm.uiState.value.activeWarnings)
    }

    @Test
    fun areaFailurePreservesSuccessfulWarnings() = runTest(dispatcher) {
        val vm = RescueMapDataViewModel(
            { Result.failure(IllegalStateException("HTTP 500")) },
            { Result.success(listOf(warning)) }
        )
        advanceUntilIdle()
        assertTrue(vm.uiState.value.floodAreas is RescueMapLoadState.Error)
        assertEquals(listOf(warning), data(vm.uiState.value.activeWarnings))
    }

    @Test
    fun warningFailurePreservesSuccessfulAreas() = runTest(dispatcher) {
        val vm = RescueMapDataViewModel(
            { Result.success(listOf(area)) },
            { Result.failure(IllegalStateException("Offline")) }
        )
        advanceUntilIdle()
        assertEquals(listOf(area), data(vm.uiState.value.floodAreas))
        assertTrue(vm.uiState.value.activeWarnings is RescueMapLoadState.Error)
    }

    @Test
    fun retryOnlyReloadsTheRequestedSource() = runTest(dispatcher) {
        var areaCalls = 0
        var warningCalls = 0
        val vm = RescueMapDataViewModel(
            {
                areaCalls++
                if (areaCalls == 1) Result.failure(IllegalStateException("Offline"))
                else Result.success(listOf(area))
            },
            { warningCalls++; Result.success(listOf(warning)) }
        )
        advanceUntilIdle()
        vm.retryFloodAreas()
        vm.retryFloodAreas()
        advanceUntilIdle()
        assertEquals(2, areaCalls)
        assertEquals(1, warningCalls)
        assertEquals(listOf(area), data(vm.uiState.value.floodAreas))
        assertEquals(listOf(warning), data(vm.uiState.value.activeWarnings))
    }

    @Test
    fun repeatedRefreshDoesNotDuplicateInFlightRequests() = runTest(dispatcher) {
        val areas = CompletableDeferred<Result<List<FloodAreaDto>>>()
        val warnings = CompletableDeferred<Result<List<FloodAlertDto>>>()
        var areaCalls = 0
        var warningCalls = 0
        val vm = RescueMapDataViewModel(
            { areaCalls++; areas.await() },
            { warningCalls++; warnings.await() }
        )
        runCurrent()
        repeat(20) {
            vm.refresh()
            vm.retryFloodAreas()
            vm.retryActiveWarnings()
        }
        runCurrent()
        val countsWhileLoading = areaCalls to warningCalls
        areas.complete(Result.success(emptyList()))
        warnings.complete(Result.success(emptyList()))
        advanceUntilIdle()
        assertEquals(1 to 1, countsWhileLoading)
    }

    @Test
    fun unexpectedLoaderExceptionBecomesARecoverableError() = runTest(dispatcher) {
        val vm = RescueMapDataViewModel(
            { throw IllegalArgumentException("Malformed response") },
            { Result.success(listOf(warning)) }
        )
        advanceUntilIdle()
        assertTrue(vm.uiState.value.floodAreas is RescueMapLoadState.Error)
        assertEquals(listOf(warning), data(vm.uiState.value.activeWarnings))
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun existingRepositoriesUseTheExpectedPathsAndResponseContract() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("""
                {"success":true,"message":"ok","data":{"floodAreas":[{
                  "id":"area-1","name":"Vùng thử nghiệm","description":null,
                  "geometry":{"type":"Polygon","points":[
                    {"latitude":16.0,"longitude":108.0},
                    {"latitude":16.01,"longitude":108.0},
                    {"latitude":16.0,"longitude":108.01}]},
                  "severity":"high","status":"active","source":"unit-test"
                }]}}
            """.trimIndent()))
            server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("""
                {"success":true,"message":"ok","data":{"floodAlerts":[{
                  "id":"warning-1","title":"Cảnh báo thử nghiệm","content":"Nội dung thử nghiệm",
                  "severity":"high","status":"active","areaId":"area-1",
                  "startAt":"2026-11-04T00:00:00.000Z","endAt":"2026-11-05T00:00:00.000Z"
                }]}}
            """.trimIndent()))
            val retrofit = Retrofit.Builder().baseUrl(server.url("/"))
                .addConverterFactory(GsonConverterFactory.create()).build()
            val areas = FloodAreaRepository(retrofit.create(FloodAreaApi::class.java))
                .getFloodAreas().getOrThrow()
            val warnings = FloodAlertRepository(retrofit.create(FloodAlertApi::class.java))
                .getActiveFloodAlerts().getOrThrow()
            assertEquals(listOf(area), areas)
            assertEquals(listOf(warning), warnings)
            assertEquals("/api/flood-areas", server.takeRequest().path)
            assertEquals("/api/flood-alerts/active", server.takeRequest().path)
        } finally {
            server.shutdown()
        }
    }

    private fun <T> data(state: RescueMapLoadState<T>): List<T> =
        (state as RescueMapLoadState.Data<T>).items
}
