package com.example.floodguard.ui.screens.sos

import com.example.floodguard.data.remote.dto.rescue.*
import com.example.floodguard.data.repository.ResidentSosApiException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
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
class ResidentSosSubmissionTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun request() = CreateSosRequest(
        location = CreateSosLocation(16.0544, 108.2022),
        situations = listOf("trapped"),
        numberOfPeople = 2,
        waterLevel = "waist",
        note = "TEST"
    )

    private fun active(id: String) = RescueRequestDto(
        id = id,
        state = "active"
    )

    private fun created() = CreatedSosDto(
        id = "NEW",
        status = "submitted",
        state = "active",
        numberOfPeople = 2
    )

    @Test
    fun emptyActive_allowsForm_andConfirmedCreateOpensNewId() =
        runTest(dispatcher) {
            var posts = 0

            val vm = ResidentSosSubmissionViewModel(
                loadActive = { Result.success(emptyList()) },
                createRemote = {
                    posts++
                    Result.success(created())
                }
            )

            runCurrent()
            assertTrue(vm.state.value.formAllowed)

            val result = vm.submit(request())

            assertTrue(result.isSuccess)
            assertEquals("NEW", vm.state.value.openSosId)
            assertEquals(1, posts)
        }

    @Test
    fun openingWithActiveRequest_opensExisting_withoutPost() =
        runTest(dispatcher) {
            var posts = 0

            val vm = ResidentSosSubmissionViewModel(
                loadActive = {
                    Result.success(listOf(active("OLD")))
                },
                createRemote = {
                    posts++
                    Result.success(created())
                }
            )

            runCurrent()

            assertEquals("OLD", vm.state.value.openSosId)
            assertFalse(vm.state.value.formAllowed)
            assertEquals(0, posts)
        }

    @Test
    fun activeAppearsBeforeSubmit_doesNotPost() = runTest(dispatcher) {
        var existing = false
        var posts = 0

        val vm = ResidentSosSubmissionViewModel(
            loadActive = {
                Result.success(
                    if (existing) listOf(active("OLD")) else emptyList()
                )
            },
            createRemote = {
                posts++
                Result.success(created())
            }
        )

        runCurrent()
        existing = true

        assertTrue(vm.submit(request()).isFailure)
        assertEquals("OLD", vm.state.value.openSosId)
        assertEquals(0, posts)
    }

    @Test
    fun duplicate409_opensBackendId_withoutSecondPost() =
        runTest(dispatcher) {
            var posts = 0

            val vm = ResidentSosSubmissionViewModel(
                loadActive = { Result.success(emptyList()) },
                createRemote = {
                    posts++
                    Result.failure(
                        ResidentSosApiException(
                            statusCode = 409,
                            code = "DUPLICATE_SOS_REQUEST",
                            activeRequestId = "OLD",
                            message = "Trùng SOS"
                        )
                    )
                }
            )

            runCurrent()

            assertTrue(vm.submit(request()).isFailure)
            assertEquals("OLD", vm.state.value.openSosId)
            assertEquals(1, posts)
        }

    @Test
    fun uncertainPost_findsActive_opensIt_withoutReportingCreateSuccess() =
        runTest(dispatcher) {
            var existing = false
            var posts = 0

            val vm = ResidentSosSubmissionViewModel(
                loadActive = {
                    Result.success(
                        if (existing) listOf(active("SAVED")) else emptyList()
                    )
                },
                createRemote = {
                    posts++
                    existing = true
                    Result.failure(IOException("timeout"))
                }
            )

            runCurrent()
            val result = vm.submit(request())

            assertTrue(result.isFailure)
            assertEquals("SAVED", vm.state.value.openSosId)
            assertEquals(1, posts)
        }

    @Test
    fun uncertainPost_noActive_keepsForm_withoutAutomaticRetry() =
        runTest(dispatcher) {
            var reads = 0
            var posts = 0

            val vm = ResidentSosSubmissionViewModel(
                loadActive = {
                    reads++
                    Result.success(emptyList())
                },
                createRemote = {
                    posts++
                    Result.failure(IOException("timeout"))
                }
            )

            runCurrent()
            val result = vm.submit(request())

            assertTrue(result.isFailure)
            assertTrue(vm.state.value.formAllowed)
            assertNull(vm.state.value.openSosId)
            assertEquals(1, posts)
            assertEquals(3, reads)
        }

    @Test
    fun failedPreflight_doesNotPost() = runTest(dispatcher) {
        var fail = false
        var posts = 0

        val vm = ResidentSosSubmissionViewModel(
            loadActive = {
                if (fail) {
                    Result.failure(IOException("offline"))
                } else {
                    Result.success(emptyList())
                }
            },
            createRemote = {
                posts++
                Result.success(created())
            }
        )

        runCurrent()
        fail = true

        assertTrue(vm.submit(request()).isFailure)
        assertEquals(0, posts)
    }

    @Test
    fun repeatedSubmit_doesNotCreateConcurrentPosts() =
        runTest(dispatcher) {
            var posts = 0
            val pending = CompletableDeferred<Result<CreatedSosDto>>()

            val vm = ResidentSosSubmissionViewModel(
                loadActive = { Result.success(emptyList()) },
                createRemote = {
                    posts++
                    pending.await()
                }
            )

            runCurrent()

            val first = async { vm.submit(request()) }
            runCurrent()

            assertTrue(vm.submit(request()).isFailure)
            assertEquals(1, posts)

            pending.complete(Result.success(created()))
            runCurrent()

            assertTrue(first.await().isSuccess)
        }

    @Test
    fun failedInitialCheck_blocksForm_thenExplicitRetryRecovers() =
        runTest(dispatcher) {
            var fail = true

            val vm = ResidentSosSubmissionViewModel(
                loadActive = {
                    if (fail) {
                        Result.failure(IOException("offline"))
                    } else {
                        Result.success(emptyList())
                    }
                },
                createRemote = {
                    error("Không được gửi SOS trong test này.")
                }
            )

            runCurrent()

            assertFalse(vm.state.value.formAllowed)
            assertNotNull(vm.state.value.error)

            fail = false
            vm.checkActive()
            runCurrent()

            assertTrue(vm.state.value.formAllowed)
            assertNull(vm.state.value.error)
        }
    @Test
    fun gpsExpiresDuringPreflight_doesNotPost() =
        runTest(dispatcher) {
            var reads = 0
            var posts = 0
            var now = 1_000L
            val capturedAt = 1_000L

            val pending =
                CompletableDeferred<Result<List<RescueRequestDto>>>()

            val vm = ResidentSosSubmissionViewModel(
                loadActive = {
                    reads++
                    if (reads == 1) {
                        Result.success(emptyList())
                    } else {
                        pending.await()
                    }
                },
                createRemote = {
                    posts++
                    Result.success(created())
                }
            )

            runCurrent()
            assertTrue(vm.state.value.formAllowed)

            val submission = async {
                vm.submit(
                    request = request(),
                    isLocationFresh = {
                        now - capturedAt in 0L..30_000L
                    }
                )
            }

            runCurrent()

            // Mẫu GPS hết hạn trong lúc GET vẫn đang chờ.
            now = 31_001L
            pending.complete(Result.success(emptyList()))
            runCurrent()

            val result = submission.await()

            assertTrue(result.isFailure)
            assertTrue(
                result.exceptionOrNull()?.message.orEmpty()
                    .contains("GPS")
            )
            assertEquals(0, posts)
            assertTrue(vm.state.value.formAllowed)
            assertNull(vm.state.value.openSosId)
        }
}