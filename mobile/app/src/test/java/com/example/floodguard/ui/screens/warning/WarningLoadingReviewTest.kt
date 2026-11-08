package com.example.floodguard.ui.screens.warning

import androidx.lifecycle.SavedStateHandle
import com.example.floodguard.data.model.FloodAlertsResponse
import com.example.floodguard.data.model.FloodAreasResponse
import com.example.floodguard.data.remote.api.FloodAlertApi
import com.example.floodguard.data.remote.api.FloodAreaApi
import com.example.floodguard.data.repository.FloodAlertRepository
import com.example.floodguard.data.repository.FloodAreaRepository
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
@OptIn(ExperimentalCoroutinesApi::class)
class WarningLoadingReviewTest {

    private val dispatcher = StandardTestDispatcher()
    private val gson = Gson()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class FakeAlertApi : FloodAlertApi {
        var calls = 0
        lateinit var reply: Response<FloodAlertsResponse>

        override suspend fun getFloodAlerts(): Response<FloodAlertsResponse> {
            calls++
            return reply
        }

        override suspend fun getActiveFloodAlerts():
                Response<FloodAlertsResponse> {
            error("Màn danh sách/chi tiết không được gọi API active.")
        }
    }

    private class FakeAreaApi : FloodAreaApi {
        var calls = 0
        lateinit var reply: Response<FloodAreasResponse>

        override suspend fun getFloodAreas(): Response<FloodAreasResponse> {
            calls++
            return reply
        }
    }

    private fun <T> httpError(): Response<T> = Response.error(
        503,
        "{}".toResponseBody("application/json".toMediaType())
    )

    private fun alertsReply(): Response<FloodAlertsResponse> {
        val json = """
            {
              "success": true,
              "message": "test",
              "data": {
                "floodAlerts": [
                  {
                    "id": "warning-A",
                    "title": "Bản tin A",
                    "content": "Nội dung A",
                    "severity": "low",
                    "status": "active",
                    "areaId": "area-A",
                    "startAt": "2026-11-08T10:00:00Z",
                    "endAt": "2026-11-08T11:00:00Z"
                  },
                  {
                    "id": "warning-B",
                    "title": "Bản tin B",
                    "content": "Nội dung B",
                    "severity": "high",
                    "status": "active",
                    "areaId": "area-B",
                    "startAt": "2026-11-08T10:00:00Z",
                    "endAt": "2026-11-08T11:00:00Z"
                  }
                ]
              }
            }
        """.trimIndent()

        return Response.success(
            gson.fromJson(json, FloodAlertsResponse::class.java)
        )
    }

    private fun areasReply(
        includeB: Boolean = true,
        nameB: String = "Khu vực B"
    ): Response<FloodAreasResponse> {
        val areas = if (includeB) {
            """[
                {"id":"area-A","name":"Khu vực A"},
                {"id":"area-B","name":"$nameB"}
            ]"""
        } else {
            """[{"id":"area-A","name":"Khu vực A"}]"""
        }

        return Response.success(
            gson.fromJson(
                """
                {
                  "success": true,
                  "message": "test",
                  "data": {"floodAreas": $areas}
                }
                """.trimIndent(),
                FloodAreasResponse::class.java
            )
        )
    }

    private fun listVm(
        alerts: FakeAlertApi,
        areas: FakeAreaApi
    ) = WarningViewModel(
        floodAlertRepository = FloodAlertRepository(alerts),
        floodAreaRepository = FloodAreaRepository(areas)
    )

    private fun detailVm(
        alerts: FakeAlertApi,
        areas: FakeAreaApi,
        id: String = "warning-B"
    ) = WarningDetailViewModel(
        savedStateHandle = SavedStateHandle(mapOf("warningId" to id)),
        floodAlertRepository = FloodAlertRepository(alerts),
        floodAreaRepository = FloodAreaRepository(areas)
    )

    @Test
    fun list_usesAreaNameMatchingEachWarning() = runTest(dispatcher) {
        val alerts = FakeAlertApi().apply { reply = alertsReply() }
        val areas = FakeAreaApi().apply { reply = areasReply() }
        val vm = listVm(alerts, areas)

        runCurrent()

        val state = vm.uiState.value as WarningUiState.Success
        assertEquals(2, state.warnings.size)
        assertEquals(
            "Khu vực B",
            state.warnings.single { it.id == "warning-B" }.area
        )
        assertNull(state.areaLoadNotice)
    }

    @Test
    fun list_areaApiError_keepsWarningsAndShowsNotice() =
        runTest(dispatcher) {
            val alerts = FakeAlertApi().apply { reply = alertsReply() }
            val areas = FakeAreaApi().apply { reply = httpError() }
            val vm = listVm(alerts, areas)

            runCurrent()

            val state = vm.uiState.value as WarningUiState.Success
            assertEquals(2, state.warnings.size)
            assertTrue(
                state.warnings.all { it.area == "Khu vực chưa có tên" }
            )
            assertNotNull(state.areaLoadNotice)
        }

    @Test
    fun list_missingArea_doesNotUseAnotherAreasName() =
        runTest(dispatcher) {
            val alerts = FakeAlertApi().apply { reply = alertsReply() }
            val areas = FakeAreaApi().apply {
                reply = areasReply(includeB = false)
            }
            val vm = listVm(alerts, areas)

            runCurrent()

            val state = vm.uiState.value as WarningUiState.Success
            assertEquals(
                "Khu vực chưa có tên",
                state.warnings.single { it.id == "warning-B" }.area
            )
            assertNotNull(state.areaLoadNotice)
        }

    @Test
    fun list_blankAreaName_usesFallback() = runTest(dispatcher) {
        val alerts = FakeAlertApi().apply { reply = alertsReply() }
        val areas = FakeAreaApi().apply { reply = areasReply(nameB = " ") }
        val vm = listVm(alerts, areas)

        runCurrent()

        val state = vm.uiState.value as WarningUiState.Success
        assertEquals(
            "Khu vực chưa có tên",
            state.warnings.single { it.id == "warning-B" }.area
        )
        assertNotNull(state.areaLoadNotice)
    }

    @Test
    fun list_alertApiError_thenRetryRecovers() = runTest(dispatcher) {
        val alerts = FakeAlertApi().apply { reply = httpError() }
        val areas = FakeAreaApi().apply { reply = areasReply() }
        val vm = listVm(alerts, areas)

        runCurrent()
        assertTrue(vm.uiState.value is WarningUiState.Error)

        alerts.reply = alertsReply()
        vm.retry()
        runCurrent()

        val state = vm.uiState.value as WarningUiState.Success
        assertEquals(2, state.warnings.size)
        assertEquals(2, alerts.calls)
    }

    @Test
    fun detail_selectsExactId_notFirstWarning() = runTest(dispatcher) {
        val alerts = FakeAlertApi().apply { reply = alertsReply() }
        val areas = FakeAreaApi().apply { reply = areasReply() }
        val vm = detailVm(alerts, areas)

        runCurrent()

        val state = vm.uiState.value
        val detail = state.warningDetail
        assertNotNull(detail)
        assertEquals("warning-B", detail?.id)
        assertEquals("Bản tin B", detail?.headline)
        assertEquals("Nội dung B", detail?.description)
        assertEquals("Khu vực B", detail?.locationSummary)
        assertNull(state.errorMessage)
        assertFalse(state.isLoading)
    }

    @Test
    fun detail_missingId_doesNotShowAnotherWarning() =
        runTest(dispatcher) {
            val alerts = FakeAlertApi().apply { reply = alertsReply() }
            val areas = FakeAreaApi().apply { reply = areasReply() }
            val vm = detailVm(alerts, areas, id = "missing")

            runCurrent()

            assertNull(vm.uiState.value.warningDetail)
            assertNotNull(vm.uiState.value.errorMessage)
            assertFalse(vm.uiState.value.isLoading)
        }

    @Test
    fun detail_areaApiError_keepsWarningContent() = runTest(dispatcher) {
        val alerts = FakeAlertApi().apply { reply = alertsReply() }
        val areas = FakeAreaApi().apply { reply = httpError() }
        val vm = detailVm(alerts, areas)

        runCurrent()

        val state = vm.uiState.value
        assertEquals("warning-B", state.warningDetail?.id)
        assertEquals(
            "Khu vực chưa có tên",
            state.warningDetail?.locationSummary
        )
        assertNotNull(state.areaLoadNotice)
        assertNull(state.errorMessage)
    }

    @Test
    fun detail_alertApiError_showsError() = runTest(dispatcher) {
        val alerts = FakeAlertApi().apply { reply = httpError() }
        val areas = FakeAreaApi().apply { reply = areasReply() }
        val vm = detailVm(alerts, areas)

        runCurrent()

        assertNull(vm.uiState.value.warningDetail)
        assertNotNull(vm.uiState.value.errorMessage)
        assertFalse(vm.uiState.value.isLoading)

        alerts.reply = alertsReply()
        vm.loadWarningDetail()
        runCurrent()

        assertEquals("warning-B", vm.uiState.value.warningDetail?.id)
        assertNull(vm.uiState.value.errorMessage)
    }
}