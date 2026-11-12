package com.example.floodguard.ui.screens.sos

import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.remote.dto.rescue.SosCoordinates
import com.example.floodguard.data.repository.ResidentSosApiException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class ResidentSosLocationUploaderTest {
    private class Harness(scope: CoroutineScope) {
        var now = 100_000L
        var reads = 0
        var captures = 0
        var patches = 0

        var serverRequest = RescueRequestDto(
            id = "A",
            state = "active",
            location = SosCoordinates(16.0, 108.0),
            locationReceivedAt = "1970-01-01T00:00:10.000Z"
        )

        var detailReply: suspend () -> Result<RescueRequestDto> = {
            Result.success(serverRequest)
        }

        var sampleReply: suspend () -> SosGpsSample = {
            SosGpsSample(16.1, 108.1, now)
        }

        var patchReply:
                suspend (SosGpsSample) -> Result<RescueRequestDto> = { sample ->
            serverRequest = serverRequest.copy(
                location = SosCoordinates(
                    sample.latitude,
                    sample.longitude
                ),
                locationCapturedAt = Instant
                    .ofEpochMilli(sample.capturedAtMillis)
                    .toString(),
                locationReceivedAt = Instant
                    .ofEpochMilli(now)
                    .toString()
            )
            Result.success(serverRequest)
        }

        val uploader = ResidentSosLocationUploader(
            scope = scope,
            loadDetail = {
                reads++
                detailReply()
            },
            captureLocation = {
                captures++
                sampleReply()
            },
            uploadLocation = { _, sample ->
                patches++
                patchReply(sample)
            },
            nowMillis = { now }
        )
    }

    @Test
    fun repeatedStart_keepsOneLoop_andUploadsNextCycle() = runTest {
        val h = Harness(backgroundScope)

        repeat(5) { h.uploader.start("A") }
        runCurrent()

        assertEquals(1, h.captures)
        assertEquals(1, h.patches)

        h.now += 30_000L
        advanceTimeBy(30_000L)
        runCurrent()

        assertEquals(2, h.captures)
        assertEquals(2, h.patches)
    }

    @Test
    fun rescuedBeforeCapture_doesNotGetOrUploadGps() = runTest {
        val h = Harness(backgroundScope)
        h.serverRequest = h.serverRequest.copy(state = "rescued")

        h.uploader.start("A")
        runCurrent()

        assertEquals(0, h.captures)
        assertEquals(0, h.patches)
        assertFalse(h.uploader.state.value.isRunning)
        assertEquals(
            "rescued",
            h.uploader.state.value.lastServerRequest?.state
        )
    }

    @Test
    fun rescuedWhileGettingGps_doesNotPatch() = runTest {
        val h = Harness(backgroundScope)

        h.sampleReply = {
            h.serverRequest = h.serverRequest.copy(state = "rescued")
            SosGpsSample(16.1, 108.1, h.now)
        }

        h.uploader.start("A")
        runCurrent()

        assertEquals(1, h.captures)
        assertEquals(0, h.patches)
        assertFalse(h.uploader.state.value.isRunning)
    }

    @Test
    fun observedRescue_cancelsPendingPatch_andIgnoresLateResult() =
        runTest {
            val h = Harness(backgroundScope)
            val pending =
                CompletableDeferred<Result<RescueRequestDto>>()

            h.patchReply = { pending.await() }

            h.uploader.start("A")
            runCurrent()
            assertEquals(1, h.patches)

            h.uploader.acceptServerRequest(
                h.serverRequest.copy(state = "rescued")
            )

            pending.complete(
                Result.success(
                    h.serverRequest.copy(
                        state = "active",
                        location = SosCoordinates(99.0, 99.0)
                    )
                )
            )
            runCurrent()

            assertFalse(h.uploader.state.value.isRunning)
            assertEquals(
                "rescued",
                h.uploader.state.value.lastServerRequest?.state
            )
            assertEquals(
                16.0,
                h.uploader.state.value.lastServerRequest
                    ?.location?.latitude
            )
        }

    @Test
    fun stale409_doesNotStopUploader_nextFreshCycleCanSucceed() =
        runTest {
            val h = Harness(backgroundScope)
            var fail = true

            h.patchReply = { sample ->
                if (fail) {
                    Result.failure(
                        ResidentSosApiException(
                            409,
                            "STALE_SOS_LOCATION",
                            null,
                            "Mẫu GPS cũ"
                        )
                    )
                } else {
                    Result.success(
                        h.serverRequest.copy(
                            location = SosCoordinates(
                                sample.latitude,
                                sample.longitude
                            )
                        )
                    )
                }
            }

            h.uploader.start("A")
            runCurrent()

            assertTrue(h.uploader.state.value.isRunning)
            assertEquals(
                16.0,
                h.uploader.state.value.lastServerRequest
                    ?.location?.latitude
            )

            fail = false
            h.now += 30_000L
            advanceTimeBy(30_000L)
            runCurrent()

            assertEquals(2, h.patches)
            assertEquals(
                16.1,
                h.uploader.state.value.lastServerRequest
                    ?.location?.latitude
            )
        }

    @Test
    fun notActive409_refreshesStatus_andStops() = runTest {
        val h = Harness(backgroundScope)

        h.patchReply = {
            h.serverRequest = h.serverRequest.copy(state = "rescued")
            Result.failure(
                ResidentSosApiException(
                    409,
                    "SOS_NOT_ACTIVE",
                    null,
                    "SOS không còn hoạt động"
                )
            )
        }

        h.uploader.start("A")
        runCurrent()

        assertEquals(3, h.reads)
        assertEquals(1, h.patches)
        assertFalse(h.uploader.state.value.isRunning)
        assertEquals(
            "rescued",
            h.uploader.state.value.lastServerRequest?.state
        )
    }

    @Test
    fun networkError_keepsLastBackendPosition() = runTest {
        val h = Harness(backgroundScope)
        h.patchReply = { Result.failure(IOException("offline")) }

        h.uploader.start("A")
        runCurrent()

        assertTrue(h.uploader.state.value.isRunning)
        assertEquals(
            16.0,
            h.uploader.state.value.lastServerRequest?.location?.latitude
        )
        assertEquals(
            "1970-01-01T00:00:10.000Z",
            h.uploader.state.value.lastServerRequest?.locationReceivedAt
        )
        assertFalse(h.uploader.state.value.isUploading)
    }

    @Test
    fun expiredGps_doesNotPatch() = runTest {
        val h = Harness(backgroundScope)
        h.sampleReply = {
            SosGpsSample(16.1, 108.1, 1L)
        }

        h.uploader.start("A")
        runCurrent()

        assertEquals(0, h.patches)
        assertTrue(h.uploader.state.value.isRunning)
    }

    @Test
    fun authorizationError_clearsPrivateData_andBlocksRestart() =
        runTest {
            for (code in listOf(401, 403)) {
                val h = Harness(backgroundScope)

                h.patchReply = {
                    Result.failure(
                        ResidentSosApiException(
                            code,
                            null,
                            null,
                            "Không có quyền"
                        )
                    )
                }

                h.uploader.start("A")
                runCurrent()

                assertNull(h.uploader.state.value.lastServerRequest)
                assertNull(h.uploader.state.value.sosId)
                assertTrue(h.uploader.state.value.accessDenied)
                assertFalse(h.uploader.state.value.isRunning)

                h.uploader.start("A")
                runCurrent()
                assertEquals(1, h.patches)
            }
        }

    @Test
    fun stopForLogout_clearsData_andCancelsPendingCapture() =
        runTest {
            val h = Harness(backgroundScope)
            val pending = CompletableDeferred<SosGpsSample>()
            h.sampleReply = { pending.await() }

            h.uploader.start("A")
            runCurrent()

            h.uploader.stop(clearData = true)
            pending.complete(SosGpsSample(16.1, 108.1, h.now))
            runCurrent()

            assertEquals(0, h.patches)
            assertNull(h.uploader.state.value.lastServerRequest)
            assertNull(h.uploader.state.value.sosId)
            assertFalse(h.uploader.state.value.isRunning)
        }
}