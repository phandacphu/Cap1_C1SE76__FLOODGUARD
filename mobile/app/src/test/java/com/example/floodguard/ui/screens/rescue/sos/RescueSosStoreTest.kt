package com.example.floodguard.ui.screens.rescue.sos
import com.example.floodguard.data.remote.dto.rescue.sos.SosHistoryWire
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RescueSosStoreTest {
    private fun item(id: String = "A", state: String = "active") = RescueSos(id, "RESIDENT", state,
        if (state == "rescued") "assisted" else "submitted", null, null, null, null,
        emptyList(), 2, null, null, if (state == "rescued") "RESCUE_B" else null,
        if (state == "rescued") "2026-11-09T00:00:00.000Z" else null, null, null)
    private class Source : RescueSosSource {
        var listAction: suspend (SosFilter) -> List<RescueSos> = { emptyList() }
        var detailAction: suspend (String) -> RescueSos = { error("Set detail") }
        var historyAction: suspend (String) -> List<SosHistoryWire> = { emptyList() }
        var completeAction: suspend (String) -> RescueSos = { error("Set completion") }
        var completeCalls = 0
        override suspend fun list(filter: SosFilter) = listAction(filter)
        override suspend fun detail(id: String) = detailAction(id)
        override suspend fun history(id: String) = historyAction(id)
        override suspend fun complete(id: String): RescueSos { completeCalls++; return completeAction(id) }
    }
    @Test fun refreshFailureKeepsDataAndRealEmptyReplacesIt() = runTest {
        val source = Source().apply { listAction = { listOf(item()) } }; val store = RescueSosStore(source, this)
        store.refresh(SosFilter.ACTIVE); runCurrent()
        source.listAction = { throw java.io.IOException("offline") }; store.refresh(SosFilter.ACTIVE); runCurrent()
        assertEquals("A", store.state.value.active.data!!.single().id); assertNotNull(store.state.value.active.error)
        source.listAction = { emptyList() }; store.refresh(SosFilter.ACTIVE); runCurrent()
        assertTrue(store.state.value.active.data!!.isEmpty()); assertNull(store.state.value.active.error)
    }
    @Test fun filtersKeepSeparateCaches() = runTest {
        val source = Source().apply { listAction = { listOf(item(state = it.query)) } }; val store = RescueSosStore(source, this)
        store.refresh(SosFilter.ACTIVE); store.refresh(SosFilter.RESCUED); runCurrent()
        assertEquals("active", store.state.value.active.data!!.single().state)
        assertEquals("rescued", store.state.value.rescued.data!!.single().state)
    }
    @Test fun oldDetailCannotShowAnotherResident() = runTest {
        val gate = CompletableDeferred<RescueSos>()
        val source = Source().apply { detailAction = { if (it == "A") withContext(NonCancellable) { gate.await() } else item(it) } }
        val store = RescueSosStore(source, this); store.openDetail("A"); runCurrent(); store.openDetail("B"); runCurrent()
        gate.complete(item("A")); advanceUntilIdle(); assertEquals("B", store.state.value.detail.data!!.id)
    }
    @Test fun changingIdImmediatelyClearsOldDetailHistory() = runTest {
        val source = Source().apply { detailAction = { item(it) }; historyAction = { listOf(SosHistoryWire("EVENT", newStatus = "submitted")) } }
        val store = RescueSosStore(source, this); store.openDetail("A"); runCurrent(); store.openDetail("B")
        assertNull(store.state.value.detail.data); assertNull(store.state.value.history.data); runCurrent()
    }
    @Test fun doubleTapMakesOnePatchAndPinWaitsForServerSuccess() = runTest {
        val gate = CompletableDeferred<RescueSos>()
        val source = Source().apply {
            listAction = { if (it == SosFilter.ACTIVE) listOf(item()) else emptyList() }
            detailAction = { item(it) }; completeAction = { gate.await() }
        }
        val store = RescueSosStore(source, this); store.refresh(SosFilter.ACTIVE); store.openDetail("A"); runCurrent()
        store.complete("A"); store.complete("A"); runCurrent()
        assertEquals(1, source.completeCalls); assertEquals(1, store.state.value.active.data!!.size)
        gate.complete(item(state = "rescued")); advanceUntilIdle()
        assertTrue(store.state.value.active.data!!.isEmpty()); assertEquals("rescued", store.state.value.detail.data!!.state)
        assertEquals("RESCUE_B", store.state.value.detail.data!!.completedBy)
    }
    @Test fun oldActiveRequestCannotResurrectCompletedPin() = runTest {
        val gate = CompletableDeferred<List<RescueSos>>(); var count = 0
        val source = Source().apply {
            listAction = { if (it == SosFilter.ACTIVE && count++ == 0) withContext(NonCancellable) { gate.await() } else emptyList() }
            detailAction = { item(it) }; completeAction = { item(it, "rescued") }
        }
        val store = RescueSosStore(source, this); store.refresh(SosFilter.ACTIVE); store.openDetail("A"); runCurrent()
        store.complete("A"); runCurrent(); gate.complete(listOf(item())); advanceUntilIdle()
        assertTrue(store.state.value.active.data!!.isEmpty())
    }
    @Test fun conflictReconcilesRealConfirmerWithoutAnotherPatch() = runTest {
        var rescued = false
        val source = Source().apply {
            detailAction = { item(it, if (rescued) "rescued" else "active") }
            completeAction = { rescued = true; throw RescueSosFailure(409, "STATUS_TRANSITION_CONFLICT", "conflict") }
        }
        val store = RescueSosStore(source, this); store.openDetail("A"); runCurrent(); store.complete("A"); advanceUntilIdle()
        assertEquals(1, source.completeCalls); assertEquals("RESCUE_B", store.state.value.detail.data!!.completedBy)
        assertFalse(store.state.value.canComplete)
    }
    @Test fun lostResponseAfterCommitNeverRetriesPatch() = runTest {
        var rescued = false
        val source = Source().apply {
            detailAction = { item(it, if (rescued) "rescued" else "active") }
            completeAction = { rescued = true; throw java.io.IOException("lost response") }
        }
        val store = RescueSosStore(source, this); store.openDetail("A"); runCurrent(); store.complete("A"); advanceUntilIdle()
        assertEquals(1, source.completeCalls); assertEquals("rescued", store.state.value.detail.data!!.state)
    }
    @Test fun uncertainWriteAndFailedReconciliationDisableConfirmation() = runTest {
        val source = Source().apply { detailAction = { item(it) }; completeAction = { throw java.io.IOException("timeout") } }
        val store = RescueSosStore(source, this); store.openDetail("A"); runCurrent()
        source.detailAction = { throw java.io.IOException("offline") }; store.complete("A"); advanceUntilIdle()
        store.complete("A"); runCurrent(); assertEquals(1, source.completeCalls); assertFalse(store.state.value.canComplete)
        assertEquals("A", store.state.value.uncertainId); assertNotNull(store.state.value.actionMessage)
    }
    @Test fun historyAuthFailureClearsAllPrivateCaches() = runTest {
        val source = Source().apply { listAction = { listOf(item()) }; detailAction = { item(it) } }
        val store = RescueSosStore(source, this); store.refresh(SosFilter.ACTIVE); store.openDetail("A"); runCurrent()
        source.historyAction = { throw RescueSosFailure(403, message = "revoked") }; store.refreshHistory(); runCurrent()
        assertNull(store.state.value.active.data); assertNull(store.state.value.detail.data)
        assertNull(store.state.value.history.data); assertEquals("revoked", store.state.value.accessError)
    }
    @Test fun ordinaryHistoryFailureDoesNotEraseDetail() = runTest {
        val source = Source().apply { detailAction = { item(it) }; historyAction = { throw java.io.IOException("offline") } }
        val store = RescueSosStore(source, this); store.openDetail("A"); runCurrent()
        assertEquals("A", store.state.value.detail.data!!.id); assertNotNull(store.state.value.history.error)
    }
    @Test fun missingDetailClearsOldDetailAndActivePin() = runTest {
        val source = Source().apply { listAction = { listOf(item()) }; detailAction = { item(it) } }
        val store = RescueSosStore(source, this); store.refresh(SosFilter.ACTIVE); store.openDetail("A"); runCurrent()
        source.detailAction = { throw RescueSosFailure(404, message = "gone") }; store.openDetail("A"); runCurrent()
        assertNull(store.state.value.detail.data); assertTrue(store.state.value.active.data!!.isEmpty())
    }
    @Test fun closingSessionCancelsAndClearsPrivateState() = runTest {
        val gate = CompletableDeferred<RescueSos>()
        val source = Source().apply { detailAction = { withContext(NonCancellable) { gate.await() } } }
        val store = RescueSosStore(source, this); store.openDetail("A"); runCurrent(); store.close()
        gate.complete(item()); advanceUntilIdle(); assertNull(store.state.value.detail.data); assertNull(store.state.value.detailId)
    }
    @Test fun refreshDoesNotCancelSlowRenderColdStart() = runTest {
        val gate = CompletableDeferred<List<RescueSos>>(); var calls = 0
        val source = Source().apply { listAction = { calls++; gate.await() } }; val store = RescueSosStore(source, this)
        store.refresh(SosFilter.ACTIVE); runCurrent(); advanceTimeBy(30_000); store.refresh(SosFilter.ACTIVE); runCurrent()
        assertEquals(1, calls); gate.complete(listOf(item())); runCurrent(); assertEquals("A", store.state.value.active.data!!.single().id)
    }
    @Test fun historyCanFinishAfterAnotherDetailRefresh() = runTest {
        val gate = CompletableDeferred<List<SosHistoryWire>>()
        val source = Source().apply { detailAction = { item(it) }; historyAction = { gate.await() } }
        val store = RescueSosStore(source, this); store.openDetail("A"); runCurrent(); store.refreshDetail(); runCurrent()
        gate.complete(listOf(SosHistoryWire("E", newStatus = "submitted"))); runCurrent()
        assertEquals("E", store.state.value.history.data!!.single().id); assertFalse(store.state.value.history.loading)
    }
    @Test fun oldRescuedResponseCannotEraseJustCompletedHistory() = runTest {
        val gate = CompletableDeferred<List<RescueSos>>(); var calls = 0
        val source = Source().apply {
            listAction = { if (it == SosFilter.ACTIVE) emptyList() else if (calls++ == 0)
                withContext(NonCancellable) { gate.await() } else listOf(item(state = "rescued")) }
            detailAction = { item(it) }; completeAction = { item(it, "rescued") }
        }
        val store = RescueSosStore(source, this); store.refresh(SosFilter.RESCUED); store.openDetail("A"); runCurrent()
        store.complete("A"); runCurrent(); gate.complete(emptyList()); advanceUntilIdle()
        assertEquals("A", store.state.value.rescued.data!!.single().id)
    }

    @Test fun lateDetailForbiddenClearsCurrentSessionData() = runTest {
        val gate = CompletableDeferred<Unit>()
        val source = Source().apply {
            listAction = { listOf(item()) }
            detailAction = { id ->
                if (id == "A") {
                    withContext(NonCancellable) {
                        gate.await()
                        throw RescueSosFailure(403, message = "revoked")
                    }
                } else item(id)
            }
        }
        val store = RescueSosStore(source, this)
        store.refresh(SosFilter.ACTIVE)
        store.openDetail("A")
        runCurrent()
        store.openDetail("B")
        runCurrent()
        assertEquals("B", store.state.value.detail.data?.id)
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals("revoked", store.state.value.accessError)
        assertNull(store.state.value.active.data)
        assertNull(store.state.value.detail.data)
        assertNull(store.state.value.history.data)
        assertFalse(store.state.value.canComplete)
    }

    @Test fun lateHistoryUnauthorizedClearsCurrentSessionData() = runTest {
        val gate = CompletableDeferred<Unit>()
        val source = Source().apply {
            detailAction = { item(it) }
            historyAction = { id ->
                if (id == "A") {
                    withContext(NonCancellable) {
                        gate.await()
                        throw RescueSosFailure(401, message = "expired")
                    }
                } else emptyList()
            }
        }
        val store = RescueSosStore(source, this)
        store.openDetail("A")
        runCurrent()
        store.openDetail("B")
        runCurrent()
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals("expired", store.state.value.accessError)
        assertNull(store.state.value.detail.data)
        assertNull(store.state.value.history.data)
    }

    @Test fun oldSessionUnauthorizedCannotAffectNewStore() = runTest {
        val gate = CompletableDeferred<Unit>()
        val oldSource = Source().apply {
            detailAction = {
                withContext(NonCancellable) {
                    gate.await()
                    throw RescueSosFailure(401, message = "old session")
                }
            }
        }
        val oldStore = RescueSosStore(oldSource, this)
        oldStore.openDetail("A")
        runCurrent()
        oldStore.close()

        val newSource = Source().apply {
            detailAction = { item(it) }
        }
        val newStore = RescueSosStore(newSource, this)
        newStore.openDetail("B")
        runCurrent()

        gate.complete(Unit)
        advanceUntilIdle()

        assertNull(oldStore.state.value.detail.data)
        assertNull(newStore.state.value.accessError)
        assertEquals("B", newStore.state.value.detail.data?.id)
    }

    @Test fun smsRefreshUsesLatestLocationWithoutChangingInitialLocation() = runTest {
        val initial = com.example.floodguard.data.remote.dto.rescue.sos.SosPoint(
            16.0544, 108.2022
        )
        val latest = com.example.floodguard.data.remote.dto.rescue.sos.SosPoint(
            16.055, 108.203
        )
        var current = item().copy(
            source = "sms",
            location = initial,
            initialLocation = initial,
            smsReceivedAt = "2026-11-24T14:00:00.000Z"
        )
        val source = Source().apply {
            listAction = { listOf(current) }
            detailAction = { current }
        }
        val store = RescueSosStore(source, this)
        store.refresh(SosFilter.ACTIVE)
        store.openDetail("A")
        runCurrent()

        current = current.copy(
            location = latest,
            locationCapturedAt = "2026-11-24T14:01:00.000Z"
        )
        store.refresh(SosFilter.ACTIVE)
        store.refreshDetail()
        runCurrent()

        assertEquals(initial, store.state.value.detail.data?.initialLocation)
        assertEquals(latest, store.state.value.detail.data?.location)
        assertEquals(latest, store.state.value.active.data?.single()?.location)
        assertEquals("sms", store.state.value.detail.data?.source)
        assertEquals(current.smsReceivedAt, store.state.value.detail.data?.smsReceivedAt)
    }

    @Test fun rescuedDetailDoesNotCancelColdStartLists() = runTest {
        verifyRescuedDetailDuringListRead(withCache = false)
    }

    @Test fun rescuedDetailDoesNotCancelCachedListRefresh() = runTest {
        verifyRescuedDetailDuringListRead(withCache = true)
    }

    private suspend fun TestScope.verifyRescuedDetailDuringListRead(
        withCache: Boolean
    ) {
        val activeGate = CompletableDeferred<List<RescueSos>>()
        val rescuedGate = CompletableDeferred<List<RescueSos>>()
        val completed = item("A", "rescued")
        val otherActive = item("B")
        val otherRescued = item("C", "rescued")

        var activeCalls = 0
        var rescuedCalls = 0

        val source = Source().apply {
            detailAction = { completed }

            listAction = { filter ->
                if (filter == SosFilter.ACTIVE) {
                    activeCalls++
                    if (withCache && activeCalls == 1) {
                        listOf(item("A"))
                    } else {
                        activeGate.await()
                    }
                } else {
                    rescuedCalls++
                    if (withCache && rescuedCalls == 1) {
                        listOf(item("OLD", "rescued"))
                    } else {
                        rescuedGate.await()
                    }
                }
            }
        }

        val store = RescueSosStore(source, this)

        try {
            if (withCache) {
                store.refresh(SosFilter.ACTIVE)
                store.refresh(SosFilter.RESCUED)
                runCurrent()

                assertEquals(
                    "A",
                    store.state.value.active.data!!.single().id
                )
                assertEquals(
                    "OLD",
                    store.state.value.rescued.data!!.single().id
                )
            }

            store.refresh(SosFilter.ACTIVE)
            store.refresh(SosFilter.RESCUED)
            runCurrent()

            assertTrue(store.state.value.active.loading)
            assertTrue(store.state.value.rescued.loading)

            store.openDetail("A")
            runCurrent()

            assertEquals(
                "rescued",
                store.state.value.detail.data?.state
            )
            assertFalse(store.state.value.canComplete)

            // Opening a rescued detail must not cancel either list.
            assertTrue(store.state.value.active.loading)
            assertTrue(store.state.value.rescued.loading)

            if (withCache) {
                assertTrue(
                    store.state.value.active.data!!.isEmpty()
                )
                assertEquals(
                    setOf("A", "OLD"),
                    store.state.value.rescued.data!!
                        .map { it.id }.toSet()
                )
            } else {
                assertNull(store.state.value.active.data)
                assertNull(store.state.value.rescued.data)
            }

            // Simulate an old active response still containing A,
            // and a rescued snapshot that does not contain A yet.
            activeGate.complete(listOf(item("A"), otherActive))
            rescuedGate.complete(listOf(otherRescued))
            advanceUntilIdle()

            val state = store.state.value

            assertFalse(state.active.loading)
            assertFalse(state.rescued.loading)
            assertNull(state.active.error)
            assertNull(state.rescued.error)

            assertEquals(
                listOf("B"),
                state.active.data!!.map { it.id }
            )

            val rescuedRows = state.rescued.data!!
            assertEquals(2, rescuedRows.size)
            assertEquals(
                setOf("A", "C"),
                rescuedRows.map { it.id }.toSet()
            )

            assertEquals(
                completed,
                rescuedRows.single { it.id == "A" }
            )

            val expectedCalls = if (withCache) 2 else 1
            assertEquals(expectedCalls, activeCalls)
            assertEquals(expectedCalls, rescuedCalls)
            assertEquals(0, source.completeCalls)
        } finally {
            store.close()
        }
    }

    @Test fun smsTimeoutReconciliationReloadsRescuedHistory() = runTest {
        var rescued = false
        val gate = CompletableDeferred<Unit>()
        val active = item().copy(source = "sms")
        val completed = item(state = "rescued").copy(source = "sms")

        val createdEvent = SosHistoryWire(
            "CREATED",
            newStatus = "submitted"
        )
        val completedEvent = SosHistoryWire(
            "COMPLETED",
            oldStatus = "submitted",
            newStatus = "assisted"
        )

        val oldHistoryGate = CompletableDeferred<Unit>()
        var historyCalls = 0

        val source = Source().apply {
            historyAction = {
                when (++historyCalls) {
                    1 -> listOf(createdEvent)
                    2 -> withContext(NonCancellable) {
                        oldHistoryGate.await()
                        listOf(createdEvent)
                    }
                    else -> listOf(createdEvent, completedEvent)
                }
            }
            detailAction = {
                if (rescued) {
                    gate.await()
                    completed
                } else active
            }
            listAction = {
                if (it == SosFilter.ACTIVE) {
                    if (rescued) emptyList() else listOf(active)
                } else {
                    if (rescued) listOf(completed) else emptyList()
                }
            }
            completeAction = {
                rescued = true
                throw java.io.IOException("timeout")
            }
        }
        val store = RescueSosStore(source, this)
        store.openDetail("A")
        store.refresh(SosFilter.ACTIVE)
        runCurrent()

        assertEquals(
            listOf(createdEvent),
            store.state.value.history.data
        )

        store.complete("A")
        runCurrent()

        assertEquals(1, source.completeCalls)
        assertEquals("A", store.state.value.uncertainId)
        assertFalse(store.state.value.canComplete)
        assertEquals(2, historyCalls)

        // The second history request is still holding an old snapshot.
        gate.complete(Unit)
        runCurrent()

        assertEquals(3, historyCalls)
        assertEquals(
            listOf(createdEvent, completedEvent),
            store.state.value.history.data
        )
        assertFalse(store.state.value.history.loading)
        assertNull(store.state.value.history.error)

        // Release the stale history after the fresh response.
        // It must not overwrite the completion event.
        oldHistoryGate.complete(Unit)
        advanceUntilIdle()

        assertEquals(
            listOf(createdEvent, completedEvent),
            store.state.value.history.data
        )
        assertEquals(
            1,
            store.state.value.history.data!!
                .count { it.newStatus == "assisted" }
        )
        assertFalse(store.state.value.history.loading)
        assertNull(store.state.value.history.error)

        assertTrue(store.state.value.active.data!!.isEmpty())
        assertEquals("A", store.state.value.rescued.data!!.single().id)
        assertEquals("sms", store.state.value.rescued.data!!.single().source)
        assertEquals("rescued", store.state.value.detail.data?.state)
        assertNull(store.state.value.uncertainId)
        assertEquals(1, source.completeCalls)
    }

    @Test fun staleRescuedSameIdCannotOverwriteNewerLocation() = runTest {
        verifyRescuedMetadataMerge(listIsNewer = false)
    }

    @Test fun newerRescuedSameIdCanUpdateOlderObservation() = runTest {
        verifyRescuedMetadataMerge(listIsNewer = true)
    }

    private suspend fun TestScope.verifyRescuedMetadataMerge(
        listIsNewer: Boolean
    ) {
        val oldPoint =
            com.example.floodguard.data.remote.dto.rescue.sos.SosPoint(
                16.0, 108.0
            )
        val newPoint =
            com.example.floodguard.data.remote.dto.rescue.sos.SosPoint(
                16.1, 108.1
            )

        val old = item("A", "rescued").copy(
            source = "sms",
            initialLocation = oldPoint,
            location = oldPoint,
            createdAt = "2026-11-24T10:00:00Z",
            updatedAt = "2026-11-24T10:01:10Z",
            locationCapturedAt = "2026-11-24T10:01:00Z",
            locationReceivedAt = "2026-11-24T10:01:10Z"
        )

        val fresh = old.copy(
            location = newPoint,
            updatedAt = "2026-11-24T10:02:10Z",
            locationCapturedAt = "2026-11-24T10:02:00Z",
            locationReceivedAt = "2026-11-24T10:02:10Z"
        )

        val detailItem = if (listIsNewer) old else fresh
        val listItem = if (listIsNewer) fresh else old

        val gate = CompletableDeferred<List<RescueSos>>()

        val source = Source().apply {
            listAction = { gate.await() }
            detailAction = { detailItem }
        }

        val store = RescueSosStore(source, this)

        try {
            store.refresh(SosFilter.RESCUED)
            runCurrent()

            store.openDetail("A")
            runCurrent()

            assertTrue(store.state.value.rescued.loading)
            assertEquals(detailItem, store.state.value.detail.data)

            gate.complete(listOf(listItem, item("B", "rescued")))
            advanceUntilIdle()

            val rows = store.state.value.rescued.data!!
            assertEquals(2, rows.size)
            assertEquals(1, rows.count { it.id == "A" })

            val merged = rows.single { it.id == "A" }

            assertEquals(fresh, merged)
            assertEquals(newPoint, merged.location)
            assertEquals(oldPoint, merged.initialLocation)
            assertEquals(fresh.updatedAt, merged.updatedAt)
            assertEquals(fresh.locationCapturedAt, merged.locationCapturedAt)
            assertEquals(fresh.locationReceivedAt, merged.locationReceivedAt)
            assertEquals("sms", merged.source)

            assertFalse(store.state.value.rescued.loading)
            assertNull(store.state.value.rescued.error)
            assertEquals(0, source.completeCalls)
        } finally {
            store.close()
        }
    }

    @Test fun rescuedMergePreservesNewestOrderAndTimestampFallback() = runTest {
        val middle = item("MID", "rescued").copy(
            createdAt = "2026-11-24T10:00:00Z"
        )
        val tieA = item("A", "rescued").copy(
            createdAt = middle.createdAt
        )
        val tieZ = item("Z", "rescued").copy(
            createdAt = middle.createdAt
        )
        val newest = item("NEW", "rescued").copy(
            createdAt = "2026-11-24T11:00:00Z",
            completedAt = "2026-11-24T12:00:00Z"
        )
        val oldest = item("OLD", "rescued").copy(
            createdAt = "2026-11-24T09:00:00Z",
            completedAt = "2026-11-25T12:00:00Z"
        )
        val missing = item("NULL", "rescued")
        val invalid = item("BAD", "rescued").copy(
            createdAt = "invalid"
        )

        val all = listOf(
            middle, tieA, tieZ, newest, oldest, missing, invalid
        )

        val gate = CompletableDeferred<List<RescueSos>>()

        val source = Source().apply {
            listAction = { gate.await() }
            detailAction = { id -> all.single { it.id == id } }
        }

        val store = RescueSosStore(source, this)

        try {
            store.refresh(SosFilter.RESCUED)
            runCurrent()

            store.openDetail("NEW")
            runCurrent()
            store.openDetail("OLD")
            runCurrent()

            gate.complete(listOf(missing, tieA, middle, invalid, tieZ))
            advanceUntilIdle()

            assertEquals(
                listOf("NEW", "Z", "MID", "A", "OLD", "NULL", "BAD"),
                store.state.value.rescued.data!!.map { it.id }
            )

            assertFalse(store.state.value.rescued.loading)
            assertNull(store.state.value.rescued.error)
            assertEquals(0, source.completeCalls)
        } finally {
            store.close()
        }
    }

    @Test fun rescuedDetailInsertsIntoCacheInCreationOrder() = runTest {
        val middle = item("MID", "rescued").copy(
            createdAt = "2026-11-24T10:00:00Z"
        )
        val newest = item("NEW", "rescued").copy(
            createdAt = "2026-11-24T11:00:00Z"
        )
        val oldest = item("OLD", "rescued").copy(
            createdAt = "2026-11-24T09:00:00Z"
        )

        val source = Source().apply {
            listAction = { listOf(middle) }
            detailAction = { id ->
                if (id == "NEW") newest else oldest
            }
        }

        val store = RescueSosStore(source, this)

        try {
            store.refresh(SosFilter.RESCUED)
            runCurrent()

            store.openDetail("NEW")
            runCurrent()
            assertEquals(
                listOf("NEW", "MID"),
                store.state.value.rescued.data!!.map { it.id }
            )

            store.openDetail("OLD")
            runCurrent()
            assertEquals(
                listOf("NEW", "MID", "OLD"),
                store.state.value.rescued.data!!.map { it.id }
            )
        } finally {
            store.close()
        }
    }

    @Test fun rescuedPatchUpdatesCacheInCreationOrder() = runTest {
        val newer = item("NEW", "rescued").copy(
            createdAt = "2026-11-24T11:00:00Z"
        )
        val active = item("A").copy(
            createdAt = "2026-11-24T09:00:00Z"
        )
        val completed = active.copy(
            state = "rescued",
            status = "assisted",
            completedBy = "RESCUE_B",
            completedAt = "2026-11-25T10:00:00Z"
        )

        val gate = CompletableDeferred<List<RescueSos>>()
        var rescuedReads = 0

        val source = Source().apply {
            listAction = { filter ->
                if (filter == SosFilter.ACTIVE) {
                    emptyList()
                } else if (++rescuedReads == 1) {
                    listOf(newer)
                } else {
                    gate.await()
                }
            }
            detailAction = { active }
            completeAction = { completed }
        }

        val store = RescueSosStore(source, this)

        try {
            store.refresh(SosFilter.RESCUED)
            store.openDetail("A")
            runCurrent()

            store.complete("A")
            runCurrent()

            assertTrue(store.state.value.rescued.loading)
            assertEquals(
                listOf("NEW", "A"),
                store.state.value.rescued.data!!.map { it.id }
            )

            gate.complete(listOf(newer, completed))
            advanceUntilIdle()

            assertEquals(
                listOf("NEW", "A"),
                store.state.value.rescued.data!!.map { it.id }
            )
            assertEquals(1, source.completeCalls)
        } finally {
            store.close()
        }
    }

    @Test fun missingDetailDoesNotCancelColdStartActiveList() = runTest {
        verifyMissingDetailDuringActiveRead(withCache = false)
    }

    @Test fun missingDetailDoesNotCancelCachedActiveRefresh() = runTest {
        verifyMissingDetailDuringActiveRead(withCache = true)
    }

    private suspend fun TestScope.verifyMissingDetailDuringActiveRead(
        withCache: Boolean
    ) {
        val gate = CompletableDeferred<List<RescueSos>>()
        var calls = 0

        val oldB = item("B").copy(note = "old")
        val freshB = oldB.copy(note = "fresh")

        val source = Source().apply {
            listAction = {
                calls++
                if (withCache && calls == 1) {
                    listOf(item("A"), oldB)
                } else {
                    gate.await()
                }
            }

            detailAction = {
                throw RescueSosFailure(404, message = "gone")
            }
        }

        val store = RescueSosStore(source, this)

        try {
            if (withCache) {
                store.refresh(SosFilter.ACTIVE)
                runCurrent()
            }

            store.refresh(SosFilter.ACTIVE)
            runCurrent()

            assertTrue(store.state.value.active.loading)

            store.openDetail("A")
            runCurrent()

            val during = store.state.value

            assertNull(during.detail.data)
            assertEquals("gone", during.detail.error)
            assertFalse(during.detail.loading)
            assertTrue(during.active.loading)
            assertNull(during.active.error)

            if (withCache) {
                assertEquals(listOf(oldB), during.active.data)
            } else {
                assertNull(during.active.data)
            }

            gate.complete(listOf(item("A"), freshB))
            advanceUntilIdle()

            val after = store.state.value

            assertEquals(listOf(freshB), after.active.data)
            assertFalse(after.active.loading)
            assertNull(after.active.error)
            assertNotNull(after.active.loadedAt)
            assertEquals(if (withCache) 2 else 1, calls)
            assertEquals(0, source.completeCalls)

            // A new authoritative list is not permanently blocked by 404.
            source.listAction = { listOf(item("A"), freshB) }

            store.refresh(SosFilter.ACTIVE)
            runCurrent()

            assertEquals(
                listOf("A", "B"),
                store.state.value.active.data!!.map { it.id }
            )
        } finally {
            store.close()
        }
    }

    @Test fun missingDetailPreservesPendingActiveReadError() = runTest {
        val gate = CompletableDeferred<Unit>()

        val source = Source().apply {
            listAction = {
                gate.await()
                throw java.io.IOException("offline")
            }
            detailAction = {
                throw RescueSosFailure(404, message = "gone")
            }
        }

        val store = RescueSosStore(source, this)

        try {
            store.refresh(SosFilter.ACTIVE)
            runCurrent()

            store.openDetail("A")
            runCurrent()

            assertTrue(store.state.value.active.loading)

            gate.complete(Unit)
            advanceUntilIdle()

            assertFalse(store.state.value.active.loading)
            assertNull(store.state.value.active.data)
            assertEquals("offline", store.state.value.active.error)
            assertEquals("gone", store.state.value.detail.error)
        } finally {
            store.close()
        }
    }

    @Test fun consecutiveRescuedRefreshCannotRegressKnownLocation() = runTest {
        val oldPoint =
            com.example.floodguard.data.remote.dto.rescue.sos.SosPoint(
                16.0, 108.0
            )

        val newPoint =
            com.example.floodguard.data.remote.dto.rescue.sos.SosPoint(
                16.1, 108.1
            )

        val old = item("A", "rescued").copy(
            location = oldPoint,
            initialLocation = oldPoint,
            createdAt = "2026-11-24T10:00:00Z",
            updatedAt = "2026-11-24T10:01:00Z",
            locationCapturedAt = "2026-11-24T10:00:30Z",
            locationReceivedAt = "2026-11-24T10:01:00Z"
        )

        val fresh = old.copy(
            location = newPoint,
            updatedAt = "2026-11-24T10:03:00Z",
            locationCapturedAt = "2026-11-24T10:02:00Z",
            locationReceivedAt = "2026-11-24T10:03:00Z"
        )

        val other = item("B", "rescued")

        val source = Source().apply {
            listAction = { listOf(old, other) }
            detailAction = { fresh }
        }

        val store = RescueSosStore(source, this)

        try {
            store.refresh(SosFilter.RESCUED)
            runCurrent()

            store.openDetail("A")
            runCurrent()

            repeat(3) {
                store.refresh(SosFilter.RESCUED)
                runCurrent()

                val rows = store.state.value.rescued.data!!

                assertEquals(2, rows.size)
                assertEquals(fresh, rows.single { it.id == "A" })
                assertEquals(other, rows.single { it.id == "B" })
                assertFalse(store.state.value.rescued.loading)
                assertNull(store.state.value.rescued.error)
            }

            // Cache must not invent membership in a new list.
            source.listAction = { listOf(other) }

            store.refresh(SosFilter.RESCUED)
            runCurrent()

            assertEquals(
                listOf(other),
                store.state.value.rescued.data
            )

            // A real empty result must remain empty.
            source.listAction = { emptyList() }

            store.refresh(SosFilter.RESCUED)
            runCurrent()

            assertTrue(store.state.value.rescued.data!!.isEmpty())
            assertEquals(0, source.completeCalls)
        } finally {
            store.close()
        }
    }

    @Test fun missingCaptureTimeUsesCreationTimeNotNetworkReceipt() = runTest {
        val initial =
            com.example.floodguard.data.remote.dto.rescue.sos.SosPoint(
                16.0, 108.0
            )

        val latest =
            com.example.floodguard.data.remote.dto.rescue.sos.SosPoint(
                16.1, 108.1
            )

        val old = item("A", "rescued").copy(
            location = initial,
            initialLocation = initial,
            createdAt = "2026-11-24T10:00:00Z",
            locationCapturedAt = null,
            locationReceivedAt = "2026-11-24T10:05:00Z",
            updatedAt = "2026-11-24T10:05:00Z"
        )

        val fresh = old.copy(
            location = latest,
            locationCapturedAt = "2026-11-24T10:02:00Z",
            locationReceivedAt = "2026-11-24T10:06:00Z",
            updatedAt = "2026-11-24T10:06:00Z"
        )

        val source = Source().apply {
            listAction = { listOf(old) }
            detailAction = { fresh }
        }

        val store = RescueSosStore(source, this)

        try {
            store.refresh(SosFilter.RESCUED)
            runCurrent()

            assertNull(
                store.state.value.rescued.data!!.single()
                    .locationCapturedAt
            )

            store.openDetail("A")
            runCurrent()

            val merged = store.state.value.rescued.data!!.single()

            assertEquals(latest, merged.location)
            assertEquals(initial, merged.initialLocation)
            assertEquals(fresh.locationCapturedAt, merged.locationCapturedAt)
            assertEquals(fresh.locationReceivedAt, merged.locationReceivedAt)

            store.refresh(SosFilter.RESCUED)
            runCurrent()

            assertEquals(
                fresh,
                store.state.value.rescued.data!!.single()
            )
        } finally {
            store.close()
        }
    }

    @Test fun recordUpdateTimeDoesNotOverrideNewerCapturedLocation() = runTest {
        val oldPoint =
            com.example.floodguard.data.remote.dto.rescue.sos.SosPoint(
                16.0, 108.0
            )

        val newPoint =
            com.example.floodguard.data.remote.dto.rescue.sos.SosPoint(
                16.1, 108.1
            )

        val positionSnapshot = item("A", "rescued").copy(
            location = newPoint,
            initialLocation = oldPoint,
            createdAt = "2026-11-24T10:00:00Z",
            updatedAt = "2026-11-24T10:03:00Z",
            locationCapturedAt = "2026-11-24T10:02:00Z",
            locationReceivedAt = "2026-11-24T10:03:00Z",
            note = "previous metadata"
        )

        val newerRecord = positionSnapshot.copy(
            location = oldPoint,
            updatedAt = "2026-11-24T10:05:00Z",
            locationCapturedAt = "2026-11-24T10:01:00Z",
            locationReceivedAt = "2026-11-24T10:01:30Z",
            note = "new metadata"
        )

        val source = Source().apply {
            listAction = { listOf(positionSnapshot) }
            detailAction = { newerRecord }
        }

        val store = RescueSosStore(source, this)

        try {
            store.refresh(SosFilter.RESCUED)
            runCurrent()

            store.openDetail("A")
            runCurrent()

            val merged = store.state.value.rescued.data!!.single()

            assertEquals("new metadata", merged.note)
            assertEquals(newerRecord.updatedAt, merged.updatedAt)
            assertEquals(newPoint, merged.location)
            assertEquals(oldPoint, merged.initialLocation)

            assertEquals(
                positionSnapshot.locationCapturedAt,
                merged.locationCapturedAt
            )

            assertEquals(
                positionSnapshot.locationReceivedAt,
                merged.locationReceivedAt
            )
        } finally {
            store.close()
        }
    }

    @Test fun rescuedIdTieBreakMatchesBackendMixedCaseFixture() = runTest {
        val ids = listOf(
            "A1", "a1", "A2", "a2",
            "Z9", "z9", "9A", "9a",
            "B1", "b1"
        )

        val rows = ids.map { id ->
            item(id, "rescued").copy(
                createdAt = "2026-11-24T10:00:00Z"
            )
        }

        val source = Source().apply {
            listAction = { rows }
        }

        val store = RescueSosStore(source, this)

        try {
            store.refresh(SosFilter.RESCUED)
            runCurrent()

            assertEquals(
                listOf(
                    "Z9", "z9", "B1", "b1",
                    "A2", "a2", "A1", "a1",
                    "9A", "9a"
                ),
                store.state.value.rescued.data!!.map { it.id }
            )
        } finally {
            store.close()
        }
    }
}
