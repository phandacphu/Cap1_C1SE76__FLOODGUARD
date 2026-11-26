package com.example.floodguard.ui.screens.rescue

import com.example.floodguard.data.model.*
import com.example.floodguard.data.remote.api.RescueFloodWarningV2Api
import com.example.floodguard.data.repository.*
import com.google.gson.JsonArray
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class RescueFloodWarningV2ViewModelTest {

    private fun withMain(
        block: suspend TestScope.() -> Unit
    ) {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            try {
                block()
            } finally {
                Dispatchers.resetMain()
            }
        }
    }

    private fun warning(
        id: String = "A",
        status: String = "active",
        startAt: String = "2026-11-22T01:00:00.000Z"
    ) = RescueFloodWarningV2Dto(
        id = id,
        schemaVersion = 2,
        title = "Cảnh báo $id",
        content = "Nội dung kiểm thử",
        status = status,
        scope = "all_published_zones",
        startAt = startAt,
        endAt = if (status == "inactive") {
            "2026-11-22T03:00:00.000Z"
        } else {
            null
        },
        createdAt = "2026-11-22T01:00:00.000Z",
        updatedAt = "2026-11-22T01:00:00.000Z",
        revision = 1
    )

    private fun listOk(
        vararg items: RescueFloodWarningV2Dto
    ): Response<RescueFloodWarningsV2ListResponse> =
        Response.success(
            RescueFloodWarningsV2ListResponse(
                success = true,
                data = RescueFloodWarningsV2ListData(
                    schemaVersion = 2,
                    floodAlerts = items.toList(),
                    serverTime = "2026-11-22T04:00:00.000Z"
                )
            )
        )

    private fun detailOk(
        item: RescueFloodWarningV2Dto
    ): Response<RescueFloodWarningsV2DetailResponse> =
        Response.success(
            RescueFloodWarningsV2DetailResponse(
                success = true,
                data = RescueFloodWarningsV2DetailData(
                    floodAlert = item,
                    serverTime = "2026-11-22T04:00:00.000Z"
                )
            )
        )

    private fun zonesOk():
        Response<RescueFloodWarningsV2ZonesResponse> =
        Response.success(
            RescueFloodWarningsV2ZonesResponse(
                success = true,
                data = RescueFloodWarningsV2ZonesData(
                    zonesRevision = "revision-test",
                    generatedAt = "2026-11-22T04:00:00.000Z",
                    coverage = RescueFloodWarningsV2Coverage(
                        status = "partial",
                        totalZones = 2,
                        evaluableZones = 0,
                        unassessableZones = JsonArray()
                    ),
                    geojson = RescueFloodWarningsV2GeoJson(
                        type = "FeatureCollection",
                        features = emptyList()
                    )
                )
            )
        )

    private data class ListCall(
        val status: String?,
        val query: String?
    )

    private inner class FakeApi : RescueFloodWarningV2Api {
        val listCalls = mutableListOf<ListCall>()
        val detailIds = mutableListOf<String>()
        var zonesCalls = 0

        var onList:
            suspend (String?, String?) ->
                Response<RescueFloodWarningsV2ListResponse> =
            { _, _ -> listOk() }

        var onDetail:
            suspend (String) ->
                Response<RescueFloodWarningsV2DetailResponse> =
            { id -> detailOk(warning(id)) }

        var onZones:
            suspend () ->
                Response<RescueFloodWarningsV2ZonesResponse> =
            { zonesOk() }

        override suspend fun getWarnings(
            status: String?,
            query: String?
        ): Response<RescueFloodWarningsV2ListResponse> {
            listCalls.add(ListCall(status, query))
            return onList(status, query)
        }

        override suspend fun getActiveWarnings():
            Response<RescueFloodWarningsV2ListResponse> =
            getWarnings("active", null)

        override suspend fun getWarningDetail(
            alertId: String
        ): Response<RescueFloodWarningsV2DetailResponse> {
            detailIds.add(alertId)
            return onDetail(alertId)
        }

        override suspend fun getZones():
            Response<RescueFloodWarningsV2ZonesResponse> {
            zonesCalls++
            return onZones()
        }
    }

    private fun viewModel(api: FakeApi) =
        RescueFloodWarningV2ViewModel(
            repository = RescueFloodWarningV2Repository(api),
            zonesRepository =
                RescueFloodWarningV2ZonesRepository(api)
        )

    @Test
    fun overviewCountsAllActiveAndShowsLatest() = withMain {
        val api = FakeApi()

        api.onList = { _, _ ->
            listOk(
                warning("A"),
                warning(
                    "B",
                    startAt = "2026-11-22T02:00:00.000Z"
                ),
                warning("C", status = "inactive")
            )
        }

        val vm = viewModel(api)
        vm.onOverviewEntered()
        runCurrent()

        val state = vm.overviewState.value

        assertTrue(state.hasLoaded)
        assertFalse(state.isLoading)
        assertEquals(3, state.warnings.size)
        assertEquals(2, state.activeCount)
        assertEquals("B", state.latestWarning?.id)
    }

    @Test
    fun emptyListIsLoadedNotAnError() = withMain {
        val vm = viewModel(FakeApi())

        vm.onListEntered()
        runCurrent()

        val state = vm.listState.value

        assertTrue(state.hasLoaded)
        assertTrue(state.warnings.isEmpty())
        assertNull(state.errorMessage)
        assertFalse(state.isStale)
    }

    @Test
    fun filterAndQuerySurviveDetailBack() = withMain {
        val api = FakeApi()

        api.onList = { status, query ->
            val items = listOf(
                warning("A"),
                warning("B", status = "inactive")
            ).filter {
                status == null || it.status == status
            }.filter {
                query == null ||
                    it.title?.contains(query, ignoreCase = true) == true
            }

            listOk(*items.toTypedArray())
        }

        val vm = viewModel(api)

        vm.onListEntered()
        runCurrent()

        vm.selectFilter(RescueWarningV2Filter.INACTIVE)
        runCurrent()

        vm.updateQuery("B")
        runCurrent()

        assertEquals("B", vm.listState.value.warnings.single().id)

        vm.openDetail("B", "entry-1")
        runCurrent()

        vm.closeDetail("entry-1", "B")
        vm.onListEntered()
        runCurrent()

        assertEquals(
            RescueWarningV2Filter.INACTIVE,
            vm.listState.value.filter
        )
        assertEquals("B", vm.listState.value.query)
        assertEquals("B", vm.listState.value.warnings.single().id)
        assertEquals(
            ListCall("inactive", "B"),
            api.listCalls.last()
        )
    }

    @Test
    fun firstLoadFailureAndRetryAreDistinct() = withMain {
        val api = FakeApi()

        api.onList = { _, _ ->
            throw IOException("offline")
        }

        val vm = viewModel(api)

        vm.onListEntered()
        runCurrent()

        assertFalse(vm.listState.value.hasLoaded)
        assertFalse(vm.listState.value.isLoading)
        assertFalse(vm.listState.value.isStale)
        assertNotNull(vm.listState.value.errorMessage)

        api.onList = { _, _ -> listOk(warning("A")) }

        vm.refreshList()
        runCurrent()

        assertTrue(vm.listState.value.hasLoaded)
        assertEquals("A", vm.listState.value.warnings.single().id)
        assertNull(vm.listState.value.errorMessage)
    }

    @Test
    fun refreshFailureKeepsPreviousWarnings() = withMain {
        val api = FakeApi()

        api.onList = { _, _ -> listOk(warning("A")) }

        val vm = viewModel(api)
        vm.onListEntered()
        runCurrent()

        api.onList = { _, _ ->
            throw IOException("offline")
        }

        vm.refreshList()
        runCurrent()

        val state = vm.listState.value

        assertEquals("A", state.warnings.single().id)
        assertTrue(state.hasLoaded)
        assertTrue(state.isStale)
        assertFalse(state.isLoading)
        assertNotNull(state.errorMessage)
    }

    @Test
    fun detailUsesExactIdAnd404ClearsIt() = withMain {
        val api = FakeApi()
        val vm = viewModel(api)

        vm.openDetail("A", "entry-A")
        runCurrent()

        assertEquals("A", vm.detailState.value.warning?.id)
        assertEquals(listOf("A"), api.detailIds)

        api.onDetail = { _ ->
            Response.error(
                404,
                "{}".toResponseBody(null)
            )
        }

        vm.refreshDetail("entry-A")
        runCurrent()

        assertTrue(vm.detailState.value.notFound)
        assertNull(vm.detailState.value.warning)
        assertNotNull(vm.detailState.value.errorMessage)
        assertEquals(listOf("A", "A"), api.detailIds)
    }

    @Test
    fun repeatedDetailEntryDoesNotDuplicateRequest() = withMain {
        val api = FakeApi()
        val vm = viewModel(api)

        vm.openDetail("A", "entry-A")
        runCurrent()

        vm.openDetail("A", "entry-A")
        runCurrent()

        assertEquals(listOf("A"), api.detailIds)

        vm.openDetail("A", "entry-A-again")
        runCurrent()

        assertEquals(listOf("A", "A"), api.detailIds)
        assertEquals(
            "entry-A-again",
            vm.detailState.value.ownerKey
        )

        vm.closeDetail("entry-A", "A")

        assertEquals(
            "entry-A-again",
            vm.detailState.value.ownerKey
        )
        assertEquals("A", vm.detailState.value.warning?.id)
    }

    @Test
    fun changingFilterRejectsLateOldResult() = withMain {
        val api = FakeApi()

        val old = CompletableDeferred<
            Response<RescueFloodWarningsV2ListResponse>
        >()

        api.onList = { status, _ ->
            if (status == null) {
                withContext(NonCancellable) {
                    old.await()
                }
            } else {
                listOk(warning("NEW"))
            }
        }

        val vm = viewModel(api)

        vm.onListEntered()
        runCurrent()

        vm.selectFilter(RescueWarningV2Filter.ACTIVE)
        runCurrent()

        assertEquals(
            "NEW",
            vm.listState.value.warnings.single().id
        )

        old.complete(
            listOk(warning("OLD", status = "inactive"))
        )
        runCurrent()

        assertEquals(
            RescueWarningV2Filter.ACTIVE,
            vm.listState.value.filter
        )
        assertEquals(
            "NEW",
            vm.listState.value.warnings.single().id
        )
    }

    @Test
    fun changingDetailRejectsLateOldResult() = withMain {
        val api = FakeApi()

        val old = CompletableDeferred<
            Response<RescueFloodWarningsV2DetailResponse>
        >()

        api.onDetail = { id ->
            if (id == "OLD") {
                withContext(NonCancellable) {
                    old.await()
                }
            } else {
                detailOk(warning("NEW"))
            }
        }

        val vm = viewModel(api)

        vm.openDetail("OLD", "old-owner")
        runCurrent()

        vm.openDetail("NEW", "new-owner")
        runCurrent()

        assertEquals(
            "NEW",
            vm.detailState.value.warning?.id
        )

        old.complete(detailOk(warning("OLD")))
        runCurrent()

        vm.closeDetail("old-owner", "OLD")

        assertEquals(
            "NEW",
            vm.detailState.value.warning?.id
        )
        assertEquals(
            "new-owner",
            vm.detailState.value.ownerKey
        )
    }

    @Test
    fun mapRefreshFailureKeepsLastSnapshot() = withMain {
        val api = FakeApi()
        val vm = viewModel(api)

        vm.onMapEntered()
        runCurrent()

        assertTrue(vm.mapState.value.hasLoaded)
        assertTrue(
            vm.mapState.value.snapshot?.incompleteForDisplay == true
        )
        assertEquals(1, api.zonesCalls)

        api.onZones = {
            throw IOException("offline")
        }

        vm.refreshZones()
        runCurrent()

        assertNotNull(vm.mapState.value.snapshot)
        assertTrue(vm.mapState.value.isStale)
        assertNotNull(vm.mapState.value.errorMessage)
        assertFalse(vm.mapState.value.isLoading)
        assertEquals(2, api.zonesCalls)
    }

    @Test
    fun forbiddenClearsStatesAndBlocksFutureRequests() = withMain {
        val api = FakeApi()

        api.onList = { _, _ ->
            listOk(warning("A"))
        }

        val vm = viewModel(api)

        vm.onOverviewEntered()
        vm.onListEntered()
        vm.onMapEntered()
        runCurrent()

        assertTrue(vm.overviewState.value.hasLoaded)
        assertTrue(vm.listState.value.hasLoaded)
        assertTrue(vm.mapState.value.hasLoaded)

        api.onList = { _, _ ->
            Response.error(
                403,
                "{}".toResponseBody(null)
            )
        }

        vm.refreshList()
        runCurrent()

        assertEquals(
            RescueWarningV2FailureKind.FORBIDDEN,
            vm.accessFailure.value
        )

        assertTrue(vm.overviewState.value.warnings.isEmpty())
        assertTrue(vm.listState.value.warnings.isEmpty())
        assertNull(vm.detailState.value.warning)
        assertNull(vm.mapState.value.snapshot)

        val count = api.listCalls.size
        val zonesCount = api.zonesCalls

        vm.refreshList()
        vm.refreshOverview()
        vm.onMapEntered()
        vm.openDetail("A", "entry-after-forbidden")
        runCurrent()

        assertEquals(count, api.listCalls.size)
        assertEquals(zonesCount, api.zonesCalls)
        assertTrue(api.detailIds.isEmpty())
    }

    @Test
    fun emptyOverviewRefreshErrorIsVisibleAndRetryRecovers() = withMain {
        val api = FakeApi()
        val vm = viewModel(api)

        vm.onOverviewEntered()
        runCurrent()
        assertTrue(vm.overviewState.value.hasLoaded)
        assertTrue(vm.overviewState.value.warnings.isEmpty())

        api.onList = { _, _ -> throw IOException("offline") }
        vm.refreshOverview()
        runCurrent()
        assertTrue(vm.overviewState.value.hasLoaded)
        assertTrue(vm.overviewState.value.isStale)
        assertNotNull(vm.overviewState.value.errorMessage)

        api.onList = { _, _ -> listOk(warning("AFTER-RETRY")) }
        vm.refreshOverview()
        runCurrent()
        assertEquals("AFTER-RETRY", vm.overviewState.value.warnings.single().id)
        assertNull(vm.overviewState.value.errorMessage)
    }

    @Test
    fun mapActive401LocksOverviewListAndZonesAndBlocksFutureMapCalls() = withMain {
        val api = FakeApi()
        api.onList = { _, _ -> listOk(warning("A")) }
        val vm = viewModel(api)
        vm.onOverviewEntered()
        vm.onListEntered()
        vm.refreshZones()
        runCurrent()
        assertNotNull(vm.mapState.value.snapshot)
        assertTrue(vm.overviewState.value.hasLoaded)

        api.onList = { status, _ ->
            if (status == "active") Response.error(401, "{}".toResponseBody(null))
            else listOk(warning("A"))
        }
        vm.onMapEntered(includeZones = true)
        runCurrent()
        assertEquals(RescueWarningV2FailureKind.UNAUTHORIZED, vm.accessFailure.value)
        assertTrue(vm.overviewState.value.warnings.isEmpty())
        assertTrue(vm.listState.value.warnings.isEmpty())
        assertNull(vm.mapState.value.snapshot)
        assertTrue(vm.activeMapState.value.warnings.isEmpty())
        val count = api.listCalls.size
        val zoneCount = api.zonesCalls
        vm.refreshActiveMapWarnings()
        vm.refreshZones()
        vm.onListEntered()
        runCurrent()
        assertEquals(count, api.listCalls.size)
        assertEquals(zoneCount, api.zonesCalls)
    }

    @Test
    fun list403AlsoBlocksMapActiveAndZonesBothWays() = withMain {
        val api = FakeApi()
        val vm = viewModel(api)
        api.onList = { _, _ -> Response.error(403, "{}".toResponseBody(null)) }
        vm.onListEntered()
        runCurrent()
        assertEquals(RescueWarningV2FailureKind.FORBIDDEN, vm.accessFailure.value)
        vm.onMapEntered(includeZones = true)
        runCurrent()
        assertEquals(1, api.listCalls.size)
        assertEquals(0, api.zonesCalls)
    }

    @Test
    fun mapTriggersActiveAndZonesWithoutLeavingOverview() = withMain {
        val api = FakeApi()
        val vm = viewModel(api)
        vm.onMapEntered(includeZones = true)
        runCurrent()
        assertTrue(vm.activeMapState.value.hasLoaded)
        assertTrue(vm.mapState.value.hasLoaded)
        assertEquals("active", api.listCalls.single().status)
        assertEquals(1, api.zonesCalls)
    }

    @Test
    fun staleMapActive401StillLocksAfterLater200() = withMain {
        val api = FakeApi()
        val old = CompletableDeferred<Response<RescueFloodWarningsV2ListResponse>>()
        var first = true
        api.onList = { _, _ ->
            if (first) {
                first = false
                withContext(NonCancellable) { old.await() }
            } else listOk(warning("NEW"))
        }
        val vm = viewModel(api)
        vm.refreshActiveMapWarnings()
        runCurrent()
        vm.refreshActiveMapWarnings()
        runCurrent()
        assertEquals("NEW", vm.activeMapState.value.warnings.single().id)
        old.complete(Response.error(401, "{}".toResponseBody(null)))
        runCurrent()
        assertEquals(RescueWarningV2FailureKind.UNAUTHORIZED, vm.accessFailure.value)
        assertTrue(vm.activeMapState.value.warnings.isEmpty())
    }

    @Test
    fun staleUnauthorizedResponseStillLocksAccess() = withMain {
        val api = FakeApi()

        val old = CompletableDeferred<
            Response<RescueFloodWarningsV2ListResponse>
        >()

        api.onList = { status, _ ->
            if (status == null) {
                withContext(NonCancellable) {
                    old.await()
                }
            } else {
                listOk(warning("NEW"))
            }
        }

        val vm = viewModel(api)

        vm.onListEntered()
        runCurrent()

        vm.selectFilter(RescueWarningV2Filter.ACTIVE)
        runCurrent()

        assertEquals(
            "NEW",
            vm.listState.value.warnings.single().id
        )

        old.complete(
            Response.error(
                401,
                "{}".toResponseBody(null)
            )
        )
        runCurrent()

        assertEquals(
            RescueWarningV2FailureKind.UNAUTHORIZED,
            vm.accessFailure.value
        )
        assertTrue(vm.listState.value.warnings.isEmpty())
        assertFalse(vm.listState.value.hasLoaded)
    }
}
