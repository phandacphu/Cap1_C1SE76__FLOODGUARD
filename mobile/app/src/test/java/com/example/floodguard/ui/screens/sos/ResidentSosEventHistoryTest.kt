package com.example.floodguard.ui.screens.sos

import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.remote.dto.rescue.SosHistoryEventDto
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
class ResidentSosEventHistoryTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun event(id: String) = SosHistoryEventDto(
        id = id,
        newStatus = "submitted",
        changedAt = "2026-11-09T03:00:00.000Z"
    )

    @Test
    fun detailIsVisibleWhileHistoryIsPending() = runTest(dispatcher) {
        val pending =
            CompletableDeferred<Result<List<SosHistoryEventDto>>>()

        val vm = ResidentSosDetailViewModel(
            sosId = "A",
            loadDetail = {
                Result.success(RescueRequestDto(id = "A"))
            },
            loadHistory = { pending.await() }
        )

        runCurrent()

        assertEquals("A", vm.uiState.value.request?.id)
        assertFalse(vm.uiState.value.isLoading)
        assertTrue(vm.historyState.value.isLoading)
        assertFalse(vm.historyState.value.hasLoaded)

        pending.complete(Result.success(listOf(event("E1"))))
        runCurrent()

        assertEquals("E1", vm.historyState.value.events.single().id)
        assertTrue(vm.historyState.value.hasLoaded)
        assertFalse(vm.historyState.value.isLoading)
    }

    @Test
    fun historyNetworkError_keepsPreviousEvents() = runTest(dispatcher) {
        var fail = false

        val vm = ResidentSosDetailViewModel(
            sosId = "A",
            loadDetail = {
                Result.success(RescueRequestDto(id = "A"))
            },
            loadHistory = {
                if (fail) {
                    Result.failure(IOException("offline"))
                } else {
                    Result.success(listOf(event("E1")))
                }
            }
        )

        runCurrent()
        fail = true
        vm.refresh()
        runCurrent()

        assertEquals("A", vm.uiState.value.request?.id)
        assertEquals("E1", vm.historyState.value.events.single().id)
        assertNotNull(vm.historyState.value.error)
        assertFalse(vm.historyState.value.isLoading)
    }

    private fun assertHistoryAccessErrorClearsEverything(code: Int) =
        runTest(dispatcher) {
            var denied = false

            val vm = ResidentSosDetailViewModel(
                sosId = "A",
                loadDetail = {
                    Result.success(RescueRequestDto(id = "A"))
                },
                loadHistory = {
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
                        Result.success(listOf(event("E1")))
                    }
                }
            )

            runCurrent()
            assertEquals(1, vm.historyState.value.events.size)

            denied = true
            vm.refresh()
            runCurrent()

            assertNull(vm.uiState.value.request)
            assertNull(vm.uiState.value.loadedAtMillis)
            assertTrue(vm.historyState.value.events.isEmpty())
            assertFalse(vm.historyState.value.hasLoaded)
            assertEquals("Lỗi quyền $code", vm.uiState.value.error)
        }

    @Test
    fun history401_clearsDetailsAndEvents() =
        assertHistoryAccessErrorClearsEverything(401)

    @Test
    fun history403_clearsDetailsAndEvents() =
        assertHistoryAccessErrorClearsEverything(403)

    @Test
    fun refreshCancelsOldHistory_oldResultCannotOverwriteNew() =
        runTest(dispatcher) {
            var calls = 0
            val oldPending =
                CompletableDeferred<Result<List<SosHistoryEventDto>>>()

            val vm = ResidentSosDetailViewModel(
                sosId = "A",
                loadDetail = {
                    Result.success(RescueRequestDto(id = "A"))
                },
                loadHistory = {
                    calls++
                    if (calls == 1) {
                        oldPending.await()
                    } else {
                        Result.success(listOf(event("NEW")))
                    }
                }
            )

            runCurrent()
            assertTrue(vm.historyState.value.isLoading)

            vm.refresh()
            runCurrent()

            assertEquals("NEW", vm.historyState.value.events.single().id)

            oldPending.complete(
                Result.success(listOf(event("OLD")))
            )
            runCurrent()

            assertEquals(2, calls)
            assertEquals("NEW", vm.historyState.value.events.single().id)
        }
}