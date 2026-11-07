package com.example.floodguard.ui.screens.sos

import com.example.floodguard.data.remote.api.RescueRequestApi
import com.example.floodguard.data.remote.dto.rescue.*
import com.example.floodguard.data.repository.RescueRequestRepository
import kotlinx.coroutines.CancellationException
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
import retrofit2.Response
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
@OptIn(ExperimentalCoroutinesApi::class)
class SosStatusViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class FakeApi : RescueRequestApi {
        var calls = 0
        var answer: suspend () -> Response<RescueRequestListResponse> = {
            error("Chưa thiết lập response giả.")
        }

        override suspend fun getRescueRequests():
                Response<RescueRequestListResponse> {
            calls++
            return answer()
        }

        override suspend fun createSos(
            request: CreateSosRequest
        ): Response<CreateSosResponse> {
            error("Test trạng thái không được tạo SOS.")
        }
    }

    private fun response(
        vararg requests: RescueRequestDto
    ): Response<RescueRequestListResponse> =
        Response.success(
            RescueRequestListResponse(
                success = true,
                data = RescueRequestListData(
                    rescueRequests = requests.toList()
                )
            )
        )

    private fun viewModel(
        api: FakeApi,
        id: String = "B",
        now: () -> Long = { 1_000L }
    ) = SosStatusViewModel(
        repository = RescueRequestRepository(api),
        sosId = id,
        nowMillis = now
    )

    @Test
    fun selectsExactId_notFirstRecord() = runTest(dispatcher) {
        val api = FakeApi().apply {
            answer = {
                response(
                    RescueRequestDto(id = "A", numberOfPeople = 2),
                    RescueRequestDto(id = "B", numberOfPeople = 5)
                )
            }
        }

        val vm = viewModel(api)
        runCurrent()

        assertEquals("B", vm.uiState.value.request?.id)
        assertEquals(5, vm.uiState.value.request?.numberOfPeople)
        assertEquals(1_000L, vm.uiState.value.loadedAtMillis)
        assertNull(vm.uiState.value.error)
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun blankId_doesNotCallApi() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api, id = " ")

        runCurrent()

        assertEquals(0, api.calls)
        assertNull(vm.uiState.value.request)
        assertNotNull(vm.uiState.value.error)
    }

    @Test
    fun missingId_doesNotSubstituteAnotherRequest() = runTest(dispatcher) {
        val api = FakeApi().apply {
            answer = { response(RescueRequestDto(id = "A")) }
        }

        val vm = viewModel(api)
        runCurrent()

        assertNull(vm.uiState.value.request)
        assertNull(vm.uiState.value.loadedAtMillis)
        assertTrue(
            vm.uiState.value.error.orEmpty().contains("Không tìm thấy")
        )
    }

    @Test
    fun duplicateId_doesNotChooseArbitrarily() = runTest(dispatcher) {
        val api = FakeApi().apply {
            answer = {
                response(
                    RescueRequestDto(id = "B", numberOfPeople = 2),
                    RescueRequestDto(id = "B", numberOfPeople = 5)
                )
            }
        }

        val vm = viewModel(api)
        runCurrent()

        assertNull(vm.uiState.value.request)
        assertTrue(vm.uiState.value.error.orEmpty().contains("trùng"))
    }

    @Test
    fun failedRefresh_preservesDataAndTimestamp_retryRecovers() =
        runTest(dispatcher) {
            var now = 1_000L
            val original = RescueRequestDto(id = "B", numberOfPeople = 5)
            val api = FakeApi().apply {
                answer = { response(original) }
            }

            val vm = viewModel(api, now = { now })
            runCurrent()

            api.answer = { throw IOException("offline") }
            now = 2_000L

            vm.refresh()

            // Dữ liệu vẫn còn trong lúc đang tải lại.
            assertTrue(vm.uiState.value.isLoading)
            assertEquals(original, vm.uiState.value.request)

            runCurrent()

            assertEquals(original, vm.uiState.value.request)
            assertEquals(1_000L, vm.uiState.value.loadedAtMillis)
            assertNotNull(vm.uiState.value.error)
            assertFalse(vm.uiState.value.isLoading)

            val updated = original.copy(numberOfPeople = 6)
            api.answer = { response(updated) }
            now = 3_000L

            vm.refresh()
            runCurrent()

            assertEquals(updated, vm.uiState.value.request)
            assertEquals(3_000L, vm.uiState.value.loadedAtMillis)
            assertNull(vm.uiState.value.error)
            assertEquals(3, api.calls)
        }

    @Test
    fun repeatedRefresh_doesNotDuplicatePendingRequest() =
        runTest(dispatcher) {
            val pending =
                CompletableDeferred<Response<RescueRequestListResponse>>()

            val api = FakeApi().apply {
                answer = { pending.await() }
            }

            val vm = viewModel(api)

            repeat(5) { vm.refresh() }
            runCurrent()

            assertEquals(1, api.calls)
            assertTrue(vm.uiState.value.isLoading)

            repeat(5) { vm.refresh() }
            runCurrent()
            assertEquals(1, api.calls)

            pending.complete(response(RescueRequestDto(id = "B")))
            runCurrent()

            assertFalse(vm.uiState.value.isLoading)
            assertEquals("B", vm.uiState.value.request?.id)
        }

    @Test
    fun successfulRefreshWithoutSelectedId_clearsOldDetails() =
        runTest(dispatcher) {
            val api = FakeApi().apply {
                answer = { response(RescueRequestDto(id = "B")) }
            }

            val vm = viewModel(api)
            runCurrent()
            assertNotNull(vm.uiState.value.request)

            api.answer = { response(RescueRequestDto(id = "A")) }
            vm.refresh()
            runCurrent()

            assertNull(vm.uiState.value.request)
            assertNull(vm.uiState.value.loadedAtMillis)
            assertNotNull(vm.uiState.value.error)
        }

    @Test
    fun nullData_isFailure_notEmptyHistory() = runTest(dispatcher) {
        val api = FakeApi().apply {
            answer = {
                Response.success(
                    RescueRequestListResponse(success = true, data = null)
                )
            }
        }

        val result = RescueRequestRepository(api).getRescueRequests()

        assertTrue(result.isFailure)
        assertTrue(
            result.exceptionOrNull()?.message.orEmpty()
                .contains("không hợp lệ")
        )
    }

    @Test
    fun explicitEmptyList_isValid() = runTest(dispatcher) {
        val api = FakeApi().apply {
            answer = { response() }
        }

        val result = RescueRequestRepository(api).getRescueRequests()

        assertTrue(result.isSuccess)
        assertEquals(emptyList<RescueRequestDto>(), result.getOrNull())
    }

    @Test
    fun repositoryCancellation_isRethrown() = runTest(dispatcher) {
        val cancellation = CancellationException("test cancellation")
        val api = FakeApi().apply {
            answer = { throw cancellation }
        }

        try {
            RescueRequestRepository(api).getRescueRequests()
            fail("Phải ném lại CancellationException.")
        } catch (error: CancellationException) {
            assertSame(cancellation, error)
        }
    }
}