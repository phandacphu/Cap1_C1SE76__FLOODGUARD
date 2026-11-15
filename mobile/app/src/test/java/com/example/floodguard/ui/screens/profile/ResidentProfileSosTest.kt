package com.example.floodguard.ui.screens.profile

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
class ResidentProfileSosTest {
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
    fun loadsActiveRescuedAndLegacyRecords() = runTest(dispatcher) {
        val requests = listOf(
            RescueRequestDto(id = "A", state = "active"),
            RescueRequestDto(id = "B", state = "rescued"),
            RescueRequestDto(id = "C", state = "legacy_other")
        )

        val vm = ProfileViewModel(
            loadRequests = { Result.success(requests) }
        )

        runCurrent()

        assertEquals(requests, vm.sosState.value.requests)
        assertNull(vm.sosState.value.error)
        assertFalse(vm.sosState.value.isLoading)
    }

    @Test
    fun networkError_preservesLoadedRequests_thenRecovers() =
        runTest(dispatcher) {
            var fail = false
            var id = "A"

            val vm = ProfileViewModel(
                loadRequests = {
                    if (fail) {
                        Result.failure(IOException("offline"))
                    } else {
                        Result.success(
                            listOf(RescueRequestDto(id = id))
                        )
                    }
                }
            )

            runCurrent()
            fail = true
            vm.loadSosHistory()
            runCurrent()

            assertEquals(
                "A",
                vm.sosState.value.requests.single().id
            )
            assertNotNull(vm.sosState.value.error)
            assertFalse(vm.sosState.value.isLoading)

            fail = false
            id = "B"
            vm.loadSosHistory()
            runCurrent()

            assertEquals(
                "B",
                vm.sosState.value.requests.single().id
            )
            assertNull(vm.sosState.value.error)
        }

    private fun assertAccessErrorClearsRequests(code: Int) =
        runTest(dispatcher) {
            var denied = false

            val vm = ProfileViewModel(
                loadRequests = {
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
                        Result.success(
                            listOf(RescueRequestDto(id = "A"))
                        )
                    }
                }
            )

            runCurrent()
            assertEquals(1, vm.sosState.value.requests.size)

            denied = true
            vm.loadSosHistory()
            runCurrent()

            assertTrue(vm.sosState.value.requests.isEmpty())
            assertEquals(
                "Lỗi quyền $code",
                vm.sosState.value.error
            )
            assertFalse(vm.sosState.value.isLoading)
        }

    @Test
    fun refresh401_clearsPrivateRequests() =
        assertAccessErrorClearsRequests(401)

    @Test
    fun refresh403_clearsPrivateRequests() =
        assertAccessErrorClearsRequests(403)

    @Test
    fun repeatedLoads_doNotDuplicatePendingRequest() =
        runTest(dispatcher) {
            var calls = 0
            val pending =
                CompletableDeferred<Result<List<RescueRequestDto>>>()

            val vm = ProfileViewModel(
                loadRequests = {
                    calls++
                    pending.await()
                }
            )

            repeat(5) { vm.loadSosHistory() }
            runCurrent()
            repeat(5) { vm.loadSosHistory() }
            runCurrent()

            assertEquals(1, calls)

            pending.complete(
                Result.success(listOf(RescueRequestDto(id = "A")))
            )
            runCurrent()

            assertEquals("A", vm.sosState.value.requests.single().id)
            assertFalse(vm.sosState.value.isLoading)
        }
}