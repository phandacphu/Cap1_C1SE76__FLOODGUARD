package com.example.floodguard.ui.screens.safe_location

import com.example.floodguard.data.model.SafeLocationDetailResponse
import com.example.floodguard.data.model.SafeLocationsResponse
import com.example.floodguard.data.remote.api.SafeLocationApi
import com.example.floodguard.data.repository.SafeLocationRepository
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class SafeLocationViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun invalidLocations_keepPreviouslyLoadedList() = runTest(dispatcher) {
        val api = FakeApi()
        val viewModel = SafeLocationViewModel(SafeLocationRepository(api))
        advanceUntilIdle()
        assertEquals("TEST-1", viewModel.uiState.value.locations.single().id)

        api.locationsJson = locationListJson(latitude = 91.0)
        viewModel.refresh()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertEquals("Chưa thể cập nhật", state.errorMessage)
        assertEquals("TEST-1", state.locations.single().id)
    }

    @Test
    fun emptySuccessfulResponse_clearsPreviouslyLoadedList() = runTest(dispatcher) {
        val api = FakeApi()
        val viewModel = SafeLocationViewModel(SafeLocationRepository(api))
        advanceUntilIdle()
        assertEquals("TEST-1", viewModel.uiState.value.locations.single().id)

        api.locationsJson = "[]"
        viewModel.refresh()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertNull(state.errorMessage)
        assertTrue(state.locations.isEmpty())
    }

    private class FakeApi : SafeLocationApi {
        var locationsJson = locationListJson(latitude = 16.0544)

        override suspend fun getSafeLocations(
            latitude: Double?,
            longitude: Double?
        ): Response<SafeLocationsResponse> {
            val body = Gson().fromJson(
                """{"success":true,"data":{"safeLocations":$locationsJson}}""",
                SafeLocationsResponse::class.java
            )
            return Response.success(body)
        }

        override suspend fun getSafeLocation(
            id: String,
            latitude: Double?,
            longitude: Double?
        ): Response<SafeLocationDetailResponse> =
            error("Ca này chỉ kiểm tra danh sách")

        override suspend fun getNearbySafeLocations(
            latitude: Double,
            longitude: Double,
            radiusKm: Double,
            type: String?
        ): Response<SafeLocationsResponse> =
            error("Ca này dùng API danh sách")
    }

    private companion object {
        fun locationListJson(latitude: Double): String = """
            [{
                "id": "TEST-1",
                "name": "Điểm tránh trú TEST",
                "address": "Địa chỉ kiểm thử",
                "type": "shelter",
                "location": {"latitude": $latitude, "longitude": 108.2022}
            }]
        """.trimIndent()
    }
}