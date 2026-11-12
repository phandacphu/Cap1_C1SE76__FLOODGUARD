package com.example.floodguard.ui.screens.rescue.sos

import com.example.floodguard.data.remote.dto.rescue.sos.*
import com.google.gson.Gson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class RescueSosRepositoryTest {
    private fun point(id: String = "SOS_A", state: String = "active", status: String = "submitted") = SosWire(
        id = id, residentId = "RESIDENT", state = state, status = status,
        location = SosPoint(0.0, 0.0), numberOfPeople = 2,
        completedBy = if (state == "rescued") "RESCUE_B" else null,
        completedAt = if (state == "rescued") "2026-11-09T00:00:00.000Z" else null)
    private suspend fun <T> failure(block: suspend () -> T): RescueSosFailure = try {
        block(); throw AssertionError("Expected failure")
    } catch (e: RescueSosFailure) { e }
    @Test fun realHttpRoutesQueriesAndCompletionBodyMatchContract() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val api = Retrofit.Builder().baseUrl(server.url("/"))
                .client(OkHttpClient.Builder().retryOnConnectionFailure(false).build())
                .addConverterFactory(GsonConverterFactory.create()).build().create(RescueSosApi::class.java)
            val repo = RescueSosRepository(api); val gson = Gson()
            server.enqueue(MockResponse().setBody(gson.toJson(SosListEnvelope(true, SosListData(listOf(point()))))))
            assertEquals("SOS_A", repo.list(SosFilter.ACTIVE).single().id)
            assertEquals("/api/rescue-requests?state=active&sort=newest", server.takeRequest().path)
            server.enqueue(MockResponse().setBody(gson.toJson(SosDetailEnvelope(true, SosDetailData(point())))))
            assertTrue(repo.detail("SOS_A").location!!.isValid())
            assertEquals("/api/rescue-requests/SOS_A", server.takeRequest().path)
            server.enqueue(MockResponse().setBody(gson.toJson(SosHistoryEnvelope(true,
                SosHistoryData("SOS_A", listOf(SosHistoryWire("EVENT", newStatus = "submitted")))))))
            assertEquals(1, repo.history("SOS_A").size)
            assertEquals("/api/rescue-requests/SOS_A/history", server.takeRequest().path)
            server.enqueue(MockResponse().setBody(gson.toJson(SosDetailEnvelope(true, SosDetailData(point(state = "rescued", status = "assisted"))))))
            assertEquals("RESCUE_B", repo.complete("SOS_A").completedBy)
            val patch = server.takeRequest()
            assertEquals("PATCH", patch.method); assertEquals("/api/rescue-requests/SOS_A/status", patch.path)
            assertEquals("{\"status\":\"assisted\"}", patch.body.readUtf8()); assertEquals(4, server.requestCount)
        } finally { server.shutdown() }
    }
    private class FakeApi : RescueSosApi {
        var row = SosWire(id = "A", state = "active", status = "submitted")
        var rows: List<SosWire?>? = listOf(row)
        var historyId = "A"
        var thrown: Exception? = null
        override suspend fun list(state: String, sort: String): retrofit2.Response<SosListEnvelope> {
            thrown?.let { throw it }; return retrofit2.Response.success(SosListEnvelope(true, SosListData(rows)))
        }
        override suspend fun detail(id: String) = retrofit2.Response.success(SosDetailEnvelope(true, SosDetailData(row)))
        override suspend fun history(id: String) = retrofit2.Response.success(SosHistoryEnvelope(true, SosHistoryData(historyId, emptyList())))
        override suspend fun complete(id: String, body: CompleteSosBody) = retrofit2.Response.success(SosDetailEnvelope(true, SosDetailData(row)))
    }
    @Test fun missingListIsAnErrorNotAnEmptySuccess() = runBlocking {
        val api = FakeApi().apply { rows = null }; assertNotNull(failure { RescueSosRepository(api).list(SosFilter.ACTIVE) })
    }
    @Test fun nullRowsAndDuplicateIdsAreRejected() = runBlocking {
        val api = FakeApi().apply { rows = listOf(null) }; val repo = RescueSosRepository(api)
        failure { repo.list(SosFilter.ACTIVE) }; api.rows = listOf(point(), point()); failure { repo.list(SosFilter.ACTIVE) }; Unit
    }
    @Test fun wrongStateCannotEnterActivePins() = runBlocking {
        val api = FakeApi().apply { rows = listOf(point(state = "rescued", status = "assisted")) }
        failure { RescueSosRepository(api).list(SosFilter.ACTIVE) }; Unit
    }
    @Test fun legacyActiveStatusIsAcceptedWithoutInventingFacts() = runBlocking {
        val api = FakeApi().apply { rows = listOf(SosWire(id = "A", state = "active", status = "in_progress")) }
        val row = RescueSosRepository(api).list(SosFilter.ACTIVE).single()
        assertNull(row.location); assertNull(row.initialLocation); assertNull(row.completedAt)
    }
    @Test fun invalidCoordinatesAndContradictoryStateAreRejected() = runBlocking {
        val api = FakeApi().apply { rows = listOf(point().copy(location = SosPoint(91.0, 108.0))) }
        val repo = RescueSosRepository(api); failure { repo.list(SosFilter.ACTIVE) }
        api.rows = listOf(point(status = "cancelled")); failure { repo.list(SosFilter.ACTIVE) }; Unit
    }
    @Test fun detailAndHistoryMustMatchRequestedId() = runBlocking {
        val repo = RescueSosRepository(FakeApi()); failure { repo.detail("OTHER") }; failure { repo.history("OTHER") }; Unit
    }
    @Test fun completionNeedsAssistedStateAndRealActorTime() = runBlocking {
        val api = FakeApi(); val repo = RescueSosRepository(api); failure { repo.complete("A") }
        api.row = point("A", "rescued", "assisted").copy(completedAt = null); failure { repo.complete("A") }; Unit
    }
    @Test fun emptyListIsAValidSuccess() = runBlocking {
        val api = FakeApi().apply { rows = emptyList() }; assertTrue(RescueSosRepository(api).list(SosFilter.ACTIVE).isEmpty())
    }
    @Test fun cancellationIsNeverConvertedToUiError() = runBlocking {
        val api = FakeApi().apply { thrown = CancellationException("stop") }
        try { RescueSosRepository(api).list(SosFilter.ACTIVE); fail("Expected cancellation") } catch (_: CancellationException) { }
    }
    @Test fun htmlErrorsAndConflictCodesAreHandledWithoutAssumingJson() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val api = Retrofit.Builder().baseUrl(server.url("/"))
                .addConverterFactory(GsonConverterFactory.create()).build().create(RescueSosApi::class.java)
            val repo = RescueSosRepository(api)
            server.enqueue(MockResponse().setResponseCode(503).setBody("<html>Unavailable</html>"))
            val unavailable = failure { repo.list(SosFilter.ACTIVE) }
            assertEquals(503, unavailable.httpStatus); assertNull(unavailable.code)
            server.enqueue(MockResponse().setResponseCode(409).setBody("{\"success\":false,\"code\":\"STATUS_TRANSITION_CONFLICT\"}"))
            val conflict = failure { repo.complete("A") }
            assertEquals(409, conflict.httpStatus); assertEquals("STATUS_TRANSITION_CONFLICT", conflict.code)
        } finally { server.shutdown() }
    }
}
