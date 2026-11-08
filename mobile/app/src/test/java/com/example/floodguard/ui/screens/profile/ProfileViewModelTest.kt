package com.example.floodguard.ui.screens.profile

import com.example.floodguard.data.remote.api.RescueRequestApi
import com.example.floodguard.data.remote.dto.rescue.*
import com.example.floodguard.data.repository.RescueRequestRepository
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

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelTest {
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
        var pending =
            CompletableDeferred<Response<RescueRequestListResponse>>()

        override suspend fun getRescueRequests():
                Response<RescueRequestListResponse> {
            calls++
            return pending.await()
        }

        override suspend fun createSos(
            request: CreateSosRequest
        ): Response<CreateSosResponse> {
            error("Test Profile không được tạo SOS.")
        }
    }

    private fun response(id: String) = Response.success(
        RescueRequestListResponse(
            success = true,
            data = RescueRequestListData(
                rescueRequests = listOf(RescueRequestDto(id = id))
            )
        )
    )

    @Test
    fun repeatedLoads_areBlockedUntilPendingRequestCompletes() =
        runTest(dispatcher) {
            val api = FakeApi()
            val vm = ProfileViewModel(RescueRequestRepository(api))

            // Chặn cả trước khi coroutine đầu tiên chạy.
            repeat(5) { vm.loadSosHistory() }
            runCurrent()
            assertEquals(1, api.calls)
            assertTrue(vm.sosState.value.isLoading)

            // Và trong khi API đang chờ.
            repeat(5) { vm.loadSosHistory() }
            runCurrent()
            assertEquals(1, api.calls)

            api.pending.complete(response("A"))
            runCurrent()
            assertFalse(vm.sosState.value.isLoading)
            assertEquals("A", vm.sosState.value.requests.single().id)

            // Sau khi hoàn tất vẫn có thể tải lại dữ liệu mới.
            api.pending = CompletableDeferred()
            vm.loadSosHistory()
            repeat(5) { vm.loadSosHistory() }
            runCurrent()
            assertEquals(2, api.calls)

            api.pending.complete(response("B"))
            runCurrent()
            assertFalse(vm.sosState.value.isLoading)
            assertEquals("B", vm.sosState.value.requests.single().id)
            assertNull(vm.sosState.value.error)
        }
}