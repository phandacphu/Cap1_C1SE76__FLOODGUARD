package com.example.floodguard.ui.screens.warning

import com.example.floodguard.data.model.FloodWarningV2DetailData
import com.example.floodguard.data.model.FloodWarningV2DetailResponse
import com.example.floodguard.data.model.FloodWarningV2Dto
import com.example.floodguard.data.model.FloodWarningV2ListData
import com.example.floodguard.data.model.FloodWarningV2ListResponse
import com.example.floodguard.data.remote.api.FloodWarningV2Api
import com.example.floodguard.data.repository.FloodWarningV2Repository
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.SessionUser
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import org.junit.Assert.assertEquals

@OptIn(ExperimentalCoroutinesApi::class)
class FloodWarningV2ViewModelTest {
    @Test
    fun late401And403ClearCachedDataForAllThreeEndpoints() {
        for (endpoint in listOf("list", "overview", "detail")) {
            for (code in listOf(401, 403)) {
                runCase(endpoint, code, accountChanged = false)
            }
        }
    }

    @Test
    fun oldAccount401And403CannotClearNewAccountData() {
        for (endpoint in listOf("list", "overview", "detail")) {
            for (code in listOf(401, 403)) {
                runCase(endpoint, code, accountChanged = true)
            }
        }
    }

    @Test
    fun stale500DoesNotClearNewerSuccessfulData() {
        for (endpoint in listOf("list", "overview", "detail")) {
            runCase(endpoint, 500, accountChanged = false)
        }
    }

    private fun runCase(
        endpoint: String,
        code: Int,
        accountChanged: Boolean
    ) = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))

        val api = DeferredApi()
        val model = FloodWarningV2ViewModel(
            FloodWarningV2Repository(api)
        )

        fun loadAll() {
            model.refreshList()
            model.refreshOverview()
            model.openDetail("alert")
        }

        fun refreshEndpoint() {
            when (endpoint) {
                "list" -> model.refreshList()
                "overview" -> model.refreshOverview()
                "detail" -> model.openDetail("alert")
                else -> error("Unknown endpoint")
            }
        }

        fun assertDataLoaded() {
            assertTrue(model.list.value.loaded)
            assertTrue(model.list.value.items.isNotEmpty())
            assertTrue(model.overview.value.loaded)
            assertTrue(model.overview.value.activeAlerts.isNotEmpty())
            assertNotNull(model.detail.value.alert)
        }

        try {
            loadAll()
            runCurrent()
            assertDataLoaded()

            // Request cũ sẽ trả kết quả dù job đã bị cancel.
            api.delayNextEndpoint = endpoint
            refreshEndpoint()
            runCurrent()
            assertTrue(api.delayed)

            if (accountChanged) {
                model.clearAccount()
                loadAll()
            } else {
                // Request mới thay thế request cũ và thành công trước.
                refreshEndpoint()
            }

            runCurrent()
            assertDataLoaded()

            api.pendingCode.complete(code)
            runCurrent()

            if (!accountChanged && code in listOf(401, 403)) {
                assertTrue(model.list.value.items.isEmpty())
                assertFalse(model.list.value.loaded)
                assertTrue(model.overview.value.activeAlerts.isEmpty())
                assertFalse(model.overview.value.loaded)
                assertNull(model.detail.value.alert)

                assertNotNull(model.list.value.error)
                assertNotNull(model.overview.value.error)
                assertNotNull(model.detail.value.error)
            } else {
                assertDataLoaded()
                assertNull(model.list.value.error)
                assertNull(model.overview.value.error)
                assertNull(model.detail.value.error)
            }
        } finally {
            model.clearAccount()
            Dispatchers.resetMain()
        }
    }

    @Test
    fun deactivationSignalRefreshesVisibleListAndDetail() {
        for (filter in listOf(
            FloodWarningV2Filter.ALL,
            FloodWarningV2Filter.ACTIVE
        )) {
            runRefreshCase(paused = false, filter = filter)
        }
    }

    @Test
    fun deactivationWhilePausedIsReconciledOnResume() {
        for (filter in listOf(
            FloodWarningV2Filter.ALL,
            FloodWarningV2Filter.ACTIVE
        )) {
            runRefreshCase(paused = true, filter = filter)
        }
    }

    private class TestOwner : LifecycleOwner {
        val registry = LifecycleRegistry.createUnsafe(this)

        override val lifecycle: Lifecycle
            get() = registry
    }

    private fun runRefreshCase(
        paused: Boolean,
        filter: FloodWarningV2Filter
    ) = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))

        val api = DeferredApi()
        val repository = FloodWarningV2Repository(api)
        val listModel = FloodWarningV2ViewModel(repository)
        val detailModel = FloodWarningV2ViewModel(repository)
        val owner = TestOwner()

        val session = AuthenticatedSessionSnapshot(
            generation = 1L,
            registrationId = java.util.UUID.randomUUID().toString(),
            user = SessionUser(
                id = "test-resident",
                role = "resident"
            ),
            accessToken = "test-token"
        )

        val sessions =
            MutableStateFlow<AuthenticatedSessionSnapshot?>(session)
        val revisions = MutableStateFlow(0L)

        owner.registry.currentState = Lifecycle.State.RESUMED

        val listObserver = backgroundScope.launch {
            observeFloodWarningV2Updates(
                lifecycle = owner.lifecycle,
                sessions = sessions,
                revisions = revisions,
                model = listModel,
                refresh = { listModel.refreshList() }
            )
        }

        val detailObserver = backgroundScope.launch {
            observeFloodWarningV2Updates(
                lifecycle = owner.lifecycle,
                sessions = sessions,
                revisions = revisions,
                model = detailModel,
                refresh = { detailModel.openDetail("alert") }
            )
        }

        try {
            runCurrent()

            listModel.selectFilter(filter)
            runCurrent()

            assertEquals(
                "active",
                listModel.list.value.items.single().status
            )
            assertEquals(
                "active",
                detailModel.detail.value.alert?.status
            )

            if (paused) {
                owner.registry.currentState = Lifecycle.State.STARTED
                runCurrent()
            }

            // Backend đã tắt bản tin; worker phát tín hiệu refresh.
            api.inactive = true
            revisions.value = 1L
            runCurrent()

            if (paused) {
                // Không tải lại khi màn hình chưa RESUMED.
                assertEquals(
                    "active",
                    detailModel.detail.value.alert?.status
                )

                owner.registry.currentState = Lifecycle.State.RESUMED
                runCurrent()
            }

            assertEquals(filter, listModel.list.value.filter)

            if (filter == FloodWarningV2Filter.ACTIVE) {
                assertTrue(listModel.list.value.items.isEmpty())
            } else {
                assertEquals(
                    "inactive",
                    listModel.list.value.items.single().status
                )
            }

            // Detail giữ đúng ID và cập nhật sang trạng thái đã tắt.
            assertEquals("alert", detailModel.detail.value.requestedId)
            assertEquals(
                "inactive",
                detailModel.detail.value.alert?.status
            )

            // Luồng phiên thực sự được nối với clearAccount().
            sessions.value = null
            runCurrent()

            assertTrue(listModel.list.value.items.isEmpty())
            assertFalse(listModel.list.value.loaded)
            assertNull(detailModel.detail.value.alert)
        } finally {
            listObserver.cancelAndJoin()
            detailObserver.cancelAndJoin()
            listModel.clearAccount()
            detailModel.clearAccount()
            Dispatchers.resetMain()
        }
    }
    private class DeferredApi : FloodWarningV2Api {
        var delayNextEndpoint: String? = null
        var delayed = false
        val pendingCode = CompletableDeferred<Int>()

        var inactive = false

        private suspend fun <T> reply(
            endpoint: String,
            success: T
        ): Response<T> {
            val code = if (
                endpoint == delayNextEndpoint && !delayed
            ) {
                delayed = true

                // Mô phỏng transport không dừng ngay khi cancel.
                withContext(NonCancellable) {
                    pendingCode.await()
                }
            } else {
                200
            }

            return if (code == 200) {
                Response.success(success)
            } else {
                Response.error(
                    code,
                    "{}".toResponseBody("application/json".toMediaType())
                )
            }
        }

        override suspend fun getAlerts(
            status: String?,
            query: String?
        ): Response<FloodWarningV2ListResponse> =
            reply("list", listResponse(status))

        override suspend fun getActiveAlerts():
                Response<FloodWarningV2ListResponse> =
            reply("overview", listResponse("active"))

        override suspend fun getAlert(
            alertId: String
        ): Response<FloodWarningV2DetailResponse> =
            reply(
                "detail",
                FloodWarningV2DetailResponse(
                    success = true,
                    data = FloodWarningV2DetailData(
                        floodAlert = alert()
                    )
                )
            )

        private fun listResponse(
            status: String? = null
        ) = FloodWarningV2ListResponse(
            success = true,
            data = FloodWarningV2ListData(
                schemaVersion = 2,
                floodAlerts = listOf(alert()).filter {
                    status == null || it.status == status
                }
            )
        )

        private fun alert() = FloodWarningV2Dto(
            id = "alert",
            schemaVersion = 2,
            title = "TEST ONLY",
            content = "Regression test",
            status = if (inactive) "inactive" else "active",
            scope = "all_published_zones",
            startAt = "2026-11-25T13:00:00Z",
            endAt = if (inactive) "2026-11-25T13:01:00Z" else null,
            createdAt = "2026-11-25T13:00:00Z",
            updatedAt = "2026-11-25T13:00:00Z",
            revision = if (inactive) 2L else 1L
        )
    }
}