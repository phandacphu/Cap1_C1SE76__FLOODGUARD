package com.example.floodguard.ui.screens.sos

import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.repository.ResidentSosApiException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
@OptIn(ExperimentalCoroutinesApi::class)
class ResidentSosDetailViewModelTest {
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
    fun activeDetail_usesExactIdAndBackendState() = runTest(dispatcher) {
        var requestedId: String? = null

        val vm = ResidentSosDetailViewModel(
            sosId = "B",
            loadDetail = { id ->
                requestedId = id
                Result.success(
                    RescueRequestDto(
                        id = "B",
                        state = "active",
                        status = "received",
                        numberOfPeople = 2
                    )
                )
            },
            nowMillis = { 1_000L }
        )

        runCurrent()

        assertEquals("B", requestedId)
        assertEquals("B", vm.uiState.value.request?.id)
        assertEquals(
            "Đã gửi — chờ cứu hộ",
            residentSosStateLabel(vm.uiState.value.request?.state)
        )
        assertNull(vm.uiState.value.request?.initialLocation)
        assertNull(vm.uiState.value.request?.locationCapturedAt)
        assertEquals(1_000L, vm.uiState.value.loadedAtMillis)
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun refresh_canChangeActiveToRescued() = runTest(dispatcher) {
        var state = "active"

        val vm = ResidentSosDetailViewModel(
            sosId = "B",
            loadDetail = {
                Result.success(
                    RescueRequestDto(
                        id = "B",
                        state = state,
                        completedAt = if (state == "rescued") {
                            "2026-11-09T03:00:00.000Z"
                        } else {
                            null
                        }
                    )
                )
            }
        )

        runCurrent()
        state = "rescued"
        vm.refresh()
        runCurrent()

        assertEquals(
            "Đã cứu",
            residentSosStateLabel(vm.uiState.value.request?.state)
        )
        assertEquals(
            "09/11/2026 10:00:00",
            residentSosTime(vm.uiState.value.request?.completedAt)
        )
    }

    @Test
    fun networkFailure_keepsLastDetailAndTimestamp() =
        runTest(dispatcher) {
            var fail = false
            var now = 1_000L

            val vm = ResidentSosDetailViewModel(
                sosId = "B",
                loadDetail = {
                    if (fail) {
                        Result.failure(IOException("offline"))
                    } else {
                        Result.success(RescueRequestDto(id = "B"))
                    }
                },
                nowMillis = { now }
            )

            runCurrent()
            fail = true
            now = 2_000L

            vm.refresh()
            runCurrent()

            assertEquals("B", vm.uiState.value.request?.id)
            assertEquals(1_000L, vm.uiState.value.loadedAtMillis)
            assertNotNull(vm.uiState.value.error)
            assertFalse(vm.uiState.value.isLoading)
        }

    private fun assertAuthorizationClearsData(code: Int) =
        runTest(dispatcher) {
            var denied = false

            val vm = ResidentSosDetailViewModel(
                sosId = "B",
                loadDetail = {
                    if (denied) {
                        Result.failure(
                            ResidentSosApiException(
                                statusCode = code,
                                code = null,
                                activeRequestId = null,
                                message = "Lỗi quyền $code"
                            )
                        )
                    } else {
                        Result.success(RescueRequestDto(id = "B"))
                    }
                }
            )

            runCurrent()
            assertNotNull(vm.uiState.value.request)

            denied = true
            vm.refresh()
            runCurrent()

            assertNull(vm.uiState.value.request)
            assertNull(vm.uiState.value.loadedAtMillis)
            assertEquals("Lỗi quyền $code", vm.uiState.value.error)
            assertFalse(vm.uiState.value.isLoading)
        }

    @Test
    fun refresh401_clearsPrivateDetails() =
        assertAuthorizationClearsData(401)

    @Test
    fun refresh403_clearsPrivateDetails() =
        assertAuthorizationClearsData(403)

    @Test
    fun repeatedRefresh_doesNotDuplicatePendingCall() =
        runTest(dispatcher) {
            var calls = 0
            val pending =
                CompletableDeferred<Result<RescueRequestDto>>()

            val vm = ResidentSosDetailViewModel(
                sosId = "B",
                loadDetail = {
                    calls++
                    pending.await()
                }
            )

            repeat(5) { vm.refresh() }
            runCurrent()

            repeat(5) { vm.refresh() }
            runCurrent()

            assertEquals(1, calls)

            pending.complete(
                Result.success(RescueRequestDto(id = "B"))
            )
            runCurrent()

            assertEquals("B", vm.uiState.value.request?.id)
            assertFalse(vm.uiState.value.isLoading)
        }

    @Test
    fun blankId_doesNotCallApi() = runTest(dispatcher) {
        var calls = 0

        val vm = ResidentSosDetailViewModel(
            sosId = " ",
            loadDetail = {
                calls++
                Result.success(RescueRequestDto(id = "B"))
            }
        )

        runCurrent()

        assertEquals(0, calls)
        assertNull(vm.uiState.value.request)
        assertNotNull(vm.uiState.value.error)
    }
}