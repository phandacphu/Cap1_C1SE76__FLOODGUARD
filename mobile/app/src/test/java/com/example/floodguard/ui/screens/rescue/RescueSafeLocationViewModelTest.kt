package com.example.floodguard.ui.screens.rescue

import com.example.floodguard.data.model.RescueSafeLocationCoordinatesDto
import com.example.floodguard.data.model.RescueSafeLocationDetailData
import com.example.floodguard.data.model.RescueSafeLocationDetailResponse
import com.example.floodguard.data.model.RescueSafeLocationDto
import com.example.floodguard.data.model.RescueSafeLocationsData
import com.example.floodguard.data.model.RescueSafeLocationsResponse
import com.example.floodguard.data.remote.api.RescueSafeLocationApi
import com.example.floodguard.data.repository.RescueCatalogGps
import com.example.floodguard.data.repository.RescueSafeLocationRepository
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
class RescueSafeLocationViewModelTest {

    private fun runWithMain(
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

    private fun item(
        id: String = "loc-a",
        distance: Double? = 0.0
    ) = RescueSafeLocationDto(
        id = id,
        name = "Điểm tránh trú $id",
        address = "Địa chỉ kiểm thử",
        location = RescueSafeLocationCoordinatesDto(
            latitude = 0.0,
            longitude = 0.0
        ),
        type = "shelter",
        description = "Dữ liệu TEST",
        distanceKm = distance
    )

    private fun listOk(
        vararg items: RescueSafeLocationDto
    ): Response<RescueSafeLocationsResponse> =
        Response.success(
            RescueSafeLocationsResponse(
                success = true,
                data = RescueSafeLocationsData(items.toList())
            )
        )

    private fun detailOk(
        item: RescueSafeLocationDto
    ): Response<RescueSafeLocationDetailResponse> =
        Response.success(
            RescueSafeLocationDetailResponse(
                success = true,
                data = RescueSafeLocationDetailData(item)
            )
        )

    private fun viewModel(api: FakeApi) =
        RescueSafeLocationViewModel(
            RescueSafeLocationRepository(api)
        )

    private class FakeApi : RescueSafeLocationApi {
        val listQueries = mutableListOf<Pair<Double?, Double?>>()
        val detailIds = mutableListOf<String>()

        var onList:
            suspend (Double?, Double?) ->
                Response<RescueSafeLocationsResponse> =
            { _, _ ->
                Response.success(
                    RescueSafeLocationsResponse(
                        success = true,
                        data = RescueSafeLocationsData(emptyList())
                    )
                )
            }

        var onDetail:
            suspend (String, Double?, Double?) ->
                Response<RescueSafeLocationDetailResponse> =
            { _, _, _ ->
                Response.success(
                    RescueSafeLocationDetailResponse(
                        success = true,
                        data = RescueSafeLocationDetailData()
                    )
                )
            }

        override suspend fun getSafeLocations(
            latitude: Double?,
            longitude: Double?
        ): Response<RescueSafeLocationsResponse> {
            listQueries.add(latitude to longitude)
            return onList(latitude, longitude)
        }

        override suspend fun getSafeLocationDetail(
            id: String,
            latitude: Double?,
            longitude: Double?
        ): Response<RescueSafeLocationDetailResponse> {
            detailIds.add(id)
            return onDetail(id, latitude, longitude)
        }
    }

    @Test
    fun initialLoadWorksWithoutGps() = runWithMain {
        val api = FakeApi()
        api.onList = { _, _ -> listOk(item()) }

        val vm = viewModel(api)
        runCurrent()

        assertTrue(vm.listState.value.hasLoaded)
        assertFalse(vm.listState.value.isLoading)
        assertEquals(1, vm.listState.value.locations.size)
        assertNull(vm.listState.value.locations.single().distanceKm)
        assertEquals(listOf(null to null), api.listQueries)
    }

    @Test
    fun emptyListIsAValidLoadedState() = runWithMain {
        val vm = viewModel(FakeApi())
        runCurrent()

        assertTrue(vm.listState.value.hasLoaded)
        assertTrue(vm.listState.value.locations.isEmpty())
        assertNull(vm.listState.value.errorMessage)
    }

    @Test
    fun gpsZeroReloadsAndDisplaysZeroDistance() = runWithMain {
        val api = FakeApi()
        api.onList = { _, _ -> listOk(item()) }

        val vm = viewModel(api)
        runCurrent()

        vm.onGpsChanged(
            RescueCatalogGps(0.0, 0.0),
            fromLastKnown = true
        )
        runCurrent()

        assertEquals(0.0, vm.listState.value.locations.single().distanceKm!!, 0.0)
        assertTrue(vm.listState.value.usingLastKnownGps)
        assertEquals(0.0 to 0.0, api.listQueries.last())
    }

    @Test
    fun gpsRevocationClearsDistanceImmediately() = runWithMain {
        val api = FakeApi()
        api.onList = { _, _ -> listOk(item()) }

        val vm = viewModel(api)
        runCurrent()

        vm.onGpsChanged(RescueCatalogGps(16.0, 108.0))
        runCurrent()
        assertNotNull(vm.listState.value.locations.single().distanceKm)

        vm.onGpsChanged(null)

        assertNull(vm.listState.value.gps)
        assertNull(vm.listState.value.locations.single().distanceKm)
        assertFalse(vm.listState.value.usingLastKnownGps)

        runCurrent()
        assertEquals(null to null, api.listQueries.last())
    }

    @Test
    fun refreshFailureKeepsPreviouslyLoadedItems() = runWithMain {
        val api = FakeApi()
        api.onList = { _, _ -> listOk(item()) }

        val vm = viewModel(api)
        runCurrent()

        api.onList = { _, _ -> throw IOException("offline") }
        vm.refreshLocations()
        runCurrent()

        assertEquals(1, vm.listState.value.locations.size)
        assertTrue(vm.listState.value.isStale)
        assertNotNull(vm.listState.value.errorMessage)
        assertFalse(vm.listState.value.isLoading)
    }

    @Test
    fun firstLoadFailureIsNotReportedAsEmptySuccess() = runWithMain {
        val api = FakeApi()
        api.onList = { _, _ -> throw IOException("offline") }

        val vm = viewModel(api)
        runCurrent()

        assertFalse(vm.listState.value.hasLoaded)
        assertFalse(vm.listState.value.isLoading)
        assertNotNull(vm.listState.value.errorMessage)
        assertFalse(vm.listState.value.isStale)
    }

    @Test
    fun detail404ClearsDataAndDisablesDirections() = runWithMain {
        val api = FakeApi()
        api.onList = { _, _ -> listOk(item()) }
        api.onDetail = { _, _, _ ->
            Response.error(404, "".toResponseBody(null))
        }

        val vm = viewModel(api)
        runCurrent()

        vm.openDetail("deleted-id")
        runCurrent()

        val detail = vm.detailState.value
        assertTrue(detail.noLongerAvailable)
        assertNull(detail.location)
        assertFalse(detail.canOpenDirections)
        assertEquals("Địa điểm không còn được cung cấp.", detail.errorMessage)
        assertEquals(2, api.listQueries.size)
    }

    @Test
    fun failedDetailRefreshMarksOldDataStale() = runWithMain {
        val api = FakeApi()
        api.onList = { _, _ -> listOk(item()) }
        api.onDetail = { _, _, _ -> detailOk(item()) }

        val vm = viewModel(api)
        runCurrent()

        vm.openDetail("loc-a")
        runCurrent()
        assertTrue(vm.detailState.value.canOpenDirections)

        api.onDetail = { _, _, _ -> throw IOException("offline") }
        vm.refreshDetail()
        runCurrent()

        assertNotNull(vm.detailState.value.location)
        assertTrue(vm.detailState.value.isStale)
        assertFalse(vm.detailState.value.canOpenDirections)
    }

    @Test
    fun openingAnotherIdClearsPreviousDetail() = runWithMain {
        val api = FakeApi()
        val pending = CompletableDeferred<
            Response<RescueSafeLocationDetailResponse>
        >()

        api.onDetail = { id, _, _ ->
            if (id == "loc-a") detailOk(item("loc-a"))
            else pending.await()
        }

        val vm = viewModel(api)
        runCurrent()

        vm.openDetail("loc-a")
        runCurrent()
        assertEquals("loc-a", vm.detailState.value.location?.id)

        vm.openDetail("loc-b")
        assertEquals("loc-b", vm.detailState.value.id)
        assertNull(vm.detailState.value.location)
        assertFalse(vm.detailState.value.canOpenDirections)

        runCurrent()
        pending.complete(detailOk(item("loc-b")))
        runCurrent()

        assertEquals("loc-b", vm.detailState.value.location?.id)
        assertEquals(listOf("loc-a", "loc-b"), api.detailIds)
    }

    @Test
    fun oldRequestCannotOverrideNewGpsResult() = runWithMain {
        val api = FakeApi()
        val oldResponse = CompletableDeferred<
            Response<RescueSafeLocationsResponse>
        >()

        api.onList = { latitude, _ ->
            if (latitude == null) {
                oldResponse.await()
            } else {
                listOk(item("new-location"))
            }
        }

        val vm = viewModel(api)
        runCurrent()

        vm.onGpsChanged(RescueCatalogGps(16.0, 108.0))
        runCurrent()

        assertEquals(
            "new-location",
            vm.listState.value.locations.single().id
        )

        oldResponse.complete(listOk(item("old-location")))
        runCurrent()

        assertEquals(
            "new-location",
            vm.listState.value.locations.single().id
        )
    }

    @Test
    fun disposalOfPreviousDetailCannotCloseCurrentDetail() = runWithMain {
        val api = FakeApi()
        api.onDetail = { id, _, _ -> detailOk(item(id)) }

        val vm = viewModel(api)
        runCurrent()

        vm.openDetail("loc-a", ownerKey = "entry-a")
        runCurrent()

        vm.openDetail("loc-b", ownerKey = "entry-b")
        runCurrent()

        // The old screen finishes its exit animation after B opened.
        vm.closeDetail("loc-a", expectedOwner = "entry-a")
        vm.refreshDetail(expectedOwner = "entry-a")
        vm.onDetailGpsChanged("entry-a", RescueCatalogGps(17.0, 108.0))

        assertEquals("loc-b", vm.detailState.value.id)
        assertEquals("entry-b", vm.detailState.value.ownerKey)
        assertEquals("loc-b", vm.detailState.value.location?.id)
        assertNull(vm.listState.value.gps)
        assertEquals(listOf("loc-a", "loc-b"), api.detailIds)
        assertTrue(vm.detailState.value.canOpenDirections)

        vm.closeDetail("loc-b", expectedOwner = "entry-b")

        assertNull(vm.detailState.value.id)
        assertNull(vm.detailState.value.location)
    }

    @Test
    fun returningToListRefreshesWithoutDuplicateInitialLoad() = runWithMain {
        val api = FakeApi()
        val vm = viewModel(api)
        runCurrent()

        assertEquals(1, api.listQueries.size)

        vm.onListScreenEntered()
        runCurrent()
        assertEquals(1, api.listQueries.size)

        vm.onListScreenEntered()
        runCurrent()
        assertEquals(2, api.listQueries.size)
    }

    @Test
    fun refreshMarksOldListStaleUntilSuccess() = runWithMain {
        val api = FakeApi()
        api.onList = { _, _ -> listOk(item()) }

        val vm = viewModel(api)
        runCurrent()

        assertFalse(vm.listState.value.isStale)

        val pending = CompletableDeferred<
            Response<RescueSafeLocationsResponse>
        >()

        api.onList = { _, _ -> pending.await() }

        vm.refreshLocations()

        assertTrue(vm.listState.value.isLoading)
        assertTrue(vm.listState.value.isStale)
        assertEquals(
            "loc-a",
            vm.listState.value.locations.single().id
        )

        runCurrent()
        pending.complete(listOk(item()))
        runCurrent()

        assertFalse(vm.listState.value.isLoading)
        assertFalse(vm.listState.value.isStale)
    }

    @Test
    fun detailBadRequestDoesNotPretendLocationDeleted() = runWithMain {
        val api = FakeApi()
        api.onDetail = { _, _, _ -> detailOk(item()) }

        val vm = viewModel(api)
        runCurrent()

        vm.openDetail("loc-a")
        runCurrent()

        api.onDetail = { _, _, _ ->
            Response.error(400, "".toResponseBody(null))
        }

        vm.refreshDetail()
        runCurrent()

        val detail = vm.detailState.value

        assertFalse(detail.noLongerAvailable)
        assertEquals(
            "Yêu cầu điểm tránh trú không hợp lệ.",
            detail.errorMessage
        )
        assertNotNull(detail.location)
        assertTrue(detail.isStale)
        assertFalse(detail.canOpenDirections)
    }

    @Test
    fun reopeningSameIdUsesNewOwnerAndOldDisposeCannotCancelIt() = runWithMain {
        val api = FakeApi()
        val firstReply = CompletableDeferred<
            Response<RescueSafeLocationDetailResponse>
        >()
        var attempt = 0
        api.onDetail = { _, _, _ ->
            attempt++
            if (attempt == 1) firstReply.await()
            else detailOk(item("loc-a").copy(description = "NEW"))
        }

        val vm = viewModel(api)
        runCurrent()
        vm.openDetail("loc-a", ownerKey = "old-entry")
        runCurrent()

        vm.openDetail("loc-a", ownerKey = "new-entry")
        runCurrent()
        assertEquals(2, attempt)
        assertEquals("new-entry", vm.detailState.value.ownerKey)
        assertEquals("NEW", vm.detailState.value.location?.description)

        // A's old DisposableEffect and Retry must not touch A's new request.
        vm.closeDetail("loc-a", expectedOwner = "old-entry")
        vm.refreshDetail(expectedOwner = "old-entry")
        assertEquals(2, attempt)
        assertEquals("loc-a", vm.detailState.value.id)
        assertEquals("new-entry", vm.detailState.value.ownerKey)
        assertTrue(vm.detailState.value.canOpenDirections)
        firstReply.complete(detailOk(item("loc-a")))
        runCurrent()
    }

    @Test
    fun lateResponseFromOldEntryOfSameIdIsIgnored() = runWithMain {
        val api = FakeApi()
        val stale = CompletableDeferred<
            Response<RescueSafeLocationDetailResponse>
        >()
        var attempt = 0
        api.onDetail = { _, _, _ ->
            attempt++
            if (attempt == 1) {
                // Simulate a callback that does not promptly cooperate
                // with cancellation after the old entry is removed.
                withContext(NonCancellable) { stale.await() }
            } else {
                detailOk(item("loc-a").copy(description = "NEW"))
            }
        }

        val vm = viewModel(api)
        runCurrent()
        vm.openDetail("loc-a", ownerKey = "old-entry")
        runCurrent()
        vm.openDetail("loc-a", ownerKey = "new-entry")
        runCurrent()
        assertEquals("NEW", vm.detailState.value.location?.description)

        stale.complete(detailOk(item("loc-a").copy(description = "STALE")))
        runCurrent()
        assertEquals("new-entry", vm.detailState.value.ownerKey)
        assertEquals("NEW", vm.detailState.value.location?.description)
    }

    @Test
    fun closingActiveEntryReleasesDetailState() = runWithMain {
        val api = FakeApi()
        api.onDetail = { _, _, _ -> detailOk(item("loc-a")) }
        val vm = viewModel(api)
        runCurrent()
        vm.openDetail("loc-a", ownerKey = "current-entry")
        runCurrent()
        assertNotNull(vm.detailState.value.location)

        vm.closeDetail("loc-a", expectedOwner = "current-entry")
        assertNull(vm.detailState.value.id)
        assertNull(vm.detailState.value.ownerKey)
        assertNull(vm.detailState.value.location)
        assertFalse(vm.detailState.value.canOpenDirections)
    }

    @Test
    fun oldEntryGpsCallbackCannotChangeCurrentDetailOrGps() = runWithMain {
        val api = FakeApi()
        api.onDetail = { id, _, _ -> detailOk(item(id)) }
        val vm = viewModel(api)
        runCurrent()
        vm.openDetail("loc-a", ownerKey = "old-entry")
        runCurrent()
        vm.openDetail("loc-a", ownerKey = "new-entry")
        runCurrent()
        val requests = api.detailIds.size

        vm.onDetailGpsChanged("old-entry", RescueCatalogGps(16.0, 108.0))
        runCurrent()
        assertNull(vm.listState.value.gps)
        assertEquals(requests, api.detailIds.size)
        assertEquals("new-entry", vm.detailState.value.ownerKey)
        assertEquals("loc-a", vm.detailState.value.location?.id)
    }
}
