package com.example.floodguard.ui.screens.sos

import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.remote.dto.rescue.SosHistoryEventDto
import com.example.floodguard.data.repository.ResidentSosApiException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
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
class ResidentSosReviewRegressionTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun activeA() = RescueRequestDto(
        id = "A",
        residentId = "resident-A",
        state = "active"
    )

    private fun accessError(code: Int) = ResidentSosApiException(
        statusCode = code,
        code = null,
        activeRequestId = null,
        message = "Lỗi quyền $code"
    )

    @Test
    fun forbiddenB_clearsB_rechecksActive_andKeepsUploadingA() =
        runTest(dispatcher) {
            var patches = 0
            var readsA = 0

            val uploader = ResidentSosLocationUploader(
                scope = backgroundScope,
                loadDetail = {
                    assertEquals("A", it)
                    readsA++
                    Result.success(activeA())
                },
                captureLocation = {
                    SosGpsSample(
                        16.0,
                        108.0,
                        100_000L + testScheduler.currentTime
                    )
                },
                uploadLocation = { id, _ ->
                    assertEquals("A", id)
                    patches++
                    Result.success(activeA())
                },
                nowMillis = {
                    100_000L + testScheduler.currentTime
                }
            )

            val wake = Channel<Unit>(Channel.CONFLATED)
            val tracking = ResidentSosTracking(
                uploader,
                MutableStateFlow<String?>(null),
                wake
            )

            uploader.start("A")
            runCurrent()
            assertEquals(1, patches)

            var forbidden = false
            val detailB = ResidentSosDetailViewModel(
                sosId = "B",
                loadDetail = {
                    val result: Result<RescueRequestDto> =
                        if (forbidden) {
                            Result.failure(accessError(403))
                        } else {
                            Result.success(
                                RescueRequestDto(id = "B", state = "active")
                            )
                        }

                    result.onFailure(tracking::onApiError)
                }
            )

            runCurrent()
            assertNotNull(detailB.uiState.value.request)

            forbidden = true
            detailB.refresh()
            runCurrent()

            assertNull(detailB.uiState.value.request)
            assertNull(detailB.uiState.value.loadedAtMillis)
            assertNotNull(detailB.uiState.value.error)

            // Đã phát tín hiệu cho host đọc lại danh sách hoạt động.
            assertTrue(wake.tryReceive().isSuccess)
            assertFalse(uploader.state.value.accessDenied)
            assertTrue(uploader.state.value.isRunning)

            val readsBefore = readsA
            advanceTimeBy(30_000L)
            runCurrent()

            // A vẫn được kiểm tra quyền/trạng thái và gửi GPS tiếp.
            assertTrue(readsA > readsBefore)
            assertEquals(2, patches)
            assertEquals("A", uploader.state.value.sosId)
        }

    @Test
    fun expiredSession401_clearsDetails_andStopsA() =
        runTest(dispatcher) {
            var patches = 0

            val uploader = ResidentSosLocationUploader(
                scope = backgroundScope,
                loadDetail = { Result.success(activeA()) },
                captureLocation = {
                    SosGpsSample(
                        16.0,
                        108.0,
                        100_000L + testScheduler.currentTime
                    )
                },
                uploadLocation = { _, _ ->
                    patches++
                    Result.success(activeA())
                },
                nowMillis = {
                    100_000L + testScheduler.currentTime
                }
            )

            val tracking = ResidentSosTracking(
                uploader,
                MutableStateFlow<String?>(null),
                Channel<Unit>(Channel.CONFLATED)
            )

            uploader.start("A")
            runCurrent()
            assertEquals(1, patches)

            var expired = false
            val detail = ResidentSosDetailViewModel(
                sosId = "A",
                loadDetail = {
                    val result: Result<RescueRequestDto> =
                        if (expired) {
                            Result.failure(accessError(401))
                        } else {
                            Result.success(activeA())
                        }

                    result.onFailure(tracking::onApiError)
                }
            )

            runCurrent()
            expired = true
            detail.refresh()
            runCurrent()

            assertNull(detail.uiState.value.request)
            assertNull(uploader.state.value.lastServerRequest)
            assertTrue(uploader.state.value.accessDenied)
            assertFalse(uploader.state.value.isRunning)

            advanceTimeBy(60_000L)
            runCurrent()
            assertEquals(1, patches)
        }

    @Test
    fun rescuedWhileDetailPending_oldTimeoutTriggersAutomaticReload() =
        runTest(dispatcher) {
            var patches = 0
            var detailCalls = 0
            var historyCalls = 0

            val rescued = activeA().copy(
                state = "rescued",
                status = "assisted",
                completedAt = "2026-11-09T03:00:00.000Z"
            )

            val uploader = ResidentSosLocationUploader(
                scope = backgroundScope,
                loadDetail = { Result.success(activeA()) },
                captureLocation = {
                    SosGpsSample(16.0, 108.0, 100_000L)
                },
                uploadLocation = { _, _ ->
                    patches++
                    Result.success(activeA())
                },
                nowMillis = { 100_000L }
            )

            uploader.start("A")
            runCurrent()
            assertEquals(1, patches)

            val pending =
                CompletableDeferred<Result<RescueRequestDto>>()

            val detail = ResidentSosDetailViewModel(
                sosId = "A",
                loadDetail = {
                    detailCalls++
                    if (detailCalls == 1) {
                        pending.await()
                    } else {
                        Result.success(rescued)
                    }
                },
                loadHistory = {
                    historyCalls++
                    Result.success(
                        listOf(
                            SosHistoryEventDto(
                                id = "completed",
                                oldStatus = "submitted",
                                newStatus = "assisted",
                                changedAt = rescued.completedAt
                            )
                        )
                    )
                }
            )

            runCurrent()
            assertTrue(detail.uiState.value.isLoading)

            // Uploader biết SOS đã cứu trong khi request chi tiết còn chờ.
            uploader.acceptServerRequest(rescued)
            detail.refreshAfterCompletion()
            runCurrent()

            assertEquals(1, detailCalls)
            assertFalse(uploader.state.value.isRunning)

            // Request cũ timeout; không bấm Làm mới thủ công.
            pending.complete(Result.failure(IOException("timeout")))
            runCurrent()

            assertEquals(2, detailCalls)
            assertEquals("rescued", detail.uiState.value.request?.state)
            assertNull(detail.uiState.value.error)
            assertEquals(1, historyCalls)
            assertEquals(
                "assisted",
                detail.historyState.value.events.single().newStatus
            )

            advanceTimeBy(60_000L)
            runCurrent()
            assertEquals(1, patches)
        }
}