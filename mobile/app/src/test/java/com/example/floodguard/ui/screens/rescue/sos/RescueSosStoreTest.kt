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

    @Test fun smsTimeoutReconciliationReloadsRescuedHistory() = runTest {
        var rescued = false
        val gate = CompletableDeferred<Unit>()
        val active = item().copy(source = "sms")
        val completed = item(state = "rescued").copy(source = "sms")
        val source = Source().apply {
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

        store.complete("A")
        runCurrent()

        assertEquals(1, source.completeCalls)
        assertEquals("A", store.state.value.uncertainId)
        assertFalse(store.state.value.canComplete)

        gate.complete(Unit)
        advanceUntilIdle()

        assertTrue(store.state.value.active.data!!.isEmpty())
        assertEquals("A", store.state.value.rescued.data!!.single().id)
        assertEquals("sms", store.state.value.rescued.data!!.single().source)
        assertEquals("rescued", store.state.value.detail.data?.state)
        assertNull(store.state.value.uncertainId)
        assertEquals(1, source.completeCalls)
    }
}
