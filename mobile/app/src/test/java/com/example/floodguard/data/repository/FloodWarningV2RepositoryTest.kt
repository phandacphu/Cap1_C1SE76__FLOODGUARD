package com.example.floodguard.data.repository

import com.example.floodguard.data.model.*
import com.example.floodguard.data.remote.api.FloodWarningV2Api
import com.google.gson.Gson
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class FloodWarningV2RepositoryTest {
    private val time = "2026-11-22T01:00:00.000Z"

    private fun alert(
        id: String = "TEST-A",
        status: String = "active",
        startAt: String = time,
        endAt: String? = null
    ) = FloodWarningV2Dto(
        id = id,
        schemaVersion = 2,
        title = "TEST ONLY",
        content = "Nội dung kiểm thử",
        status = status,
        scope = "all_published_zones",
        startAt = startAt,
        endAt = endAt,
        createdAt = time,
        updatedAt = time,
        revision = 1L
    )

    private class FakeApi : FloodWarningV2Api {
        var list = FloodWarningV2ListResponse(
            success = true,
            data = FloodWarningV2ListData(
                schemaVersion = 2,
                floodAlerts = emptyList()
            )
        )
        var detail = FloodWarningV2DetailResponse()
        var detailCode = 200
        var requestedStatus: String? = null
        var requestedQuery: String? = null
        var requestedId: String? = null

        override suspend fun getAlerts(
            status: String?,
            query: String?
        ): Response<FloodWarningV2ListResponse> {
            requestedStatus = status
            requestedQuery = query
            return Response.success(list)
        }

        override suspend fun getActiveAlerts() = Response.success(list)

        override suspend fun getAlert(
            alertId: String
        ): Response<FloodWarningV2DetailResponse> {
            requestedId = alertId
            if (detailCode == 404) {
                return Response.error(
                    404,
                    okhttp3.ResponseBody.create(null, "")
                )
            }
            return Response.success(detail)
        }

        fun records(vararg items: FloodWarningV2Dto?) {
            list = list.copy(
                data = FloodWarningV2ListData(2, items.toList())
            )
        }
    }

    @Test
    fun emptyV2IsSuccessAndAllOmitsStatus() = runBlocking {
        val api = FakeApi()
        val result = FloodWarningV2Repository(api).getAlerts()
        assertTrue(result.isSuccess)
        assertTrue(result.getOrThrow().isEmpty())
        assertNull(api.requestedStatus)
        assertNull(api.requestedQuery)
    }

    @Test
    fun v1ResponseIsErrorNotEmpty() = runBlocking {
        val api = FakeApi()
        api.list = Gson().fromJson(
            """{"success":true,"data":{"floodAlerts":[]}}""",
            FloodWarningV2ListResponse::class.java
        )
        assertTrue(FloodWarningV2Repository(api).getAlerts().isFailure)
    }

    @Test
    fun invalidRecordFailsWholeList() = runBlocking {
        val api = FakeApi()
        api.records(alert(), alert("TEST-B").copy(schemaVersion = 1))
        assertTrue(FloodWarningV2Repository(api).getAlerts().isFailure)

        api.records(null)
        assertTrue(FloodWarningV2Repository(api).getAlerts().isFailure)
    }

    @Test
    fun keepsEveryRecordAndSortsNewestThenId() = runBlocking {
        val api = FakeApi()
        api.records(
            alert("TEST-B"),
            alert("TEST-C", startAt = "2026-11-22T02:00:00.000Z"),
            alert("TEST-A")
        )
        val items = FloodWarningV2Repository(api).getAlerts().getOrThrow()
        assertEquals(listOf("TEST-C", "TEST-A", "TEST-B"), items.map { it.id })
    }

    @Test
    fun filterAndQueryArePassedCorrectly() = runBlocking {
        val api = FakeApi()
        api.records(alert())
        val result = FloodWarningV2Repository(api).getAlerts(
            status = "active",
            query = "  mưa  "
        )
        assertTrue(result.isSuccess)
        assertEquals("active", api.requestedStatus)
        assertEquals("mưa", api.requestedQuery)

        api.records(alert(status = "inactive", endAt = time))
        assertTrue(
            FloodWarningV2Repository(api).getActiveAlerts().isFailure
        )
    }

    @Test
    fun detailMustMatchRequestedId() = runBlocking {
        val api = FakeApi()
        api.detail = FloodWarningV2DetailResponse(
            success = true,
            data = FloodWarningV2DetailData(alert("TEST-B"))
        )
        assertTrue(
            FloodWarningV2Repository(api).getAlert("TEST-A").isFailure
        )
        assertEquals("TEST-A", api.requestedId)
    }

    @Test
    fun inactiveRemainsReadableWithValidEndTime() = runBlocking {
        val api = FakeApi()
        api.detail = FloodWarningV2DetailResponse(
            success = true,
            data = FloodWarningV2DetailData(
                alert(status = "inactive", endAt = time)
            )
        )
        val result = FloodWarningV2Repository(api).getAlert("TEST-A")
        assertEquals("inactive", result.getOrThrow().status)

        api.detail = api.detail.copy(
            data = FloodWarningV2DetailData(
                alert(status = "inactive", endAt = null)
            )
        )
        assertTrue(
            FloodWarningV2Repository(api).getAlert("TEST-A").isFailure
        )
    }

    @Test
    fun missingDetailPreserves404() = runBlocking {
        val api = FakeApi().apply { detailCode = 404 }
        val error = FloodWarningV2Repository(api)
            .getAlert("TEST-MISSING")
            .exceptionOrNull()
        assertTrue(error is HttpException)
        assertEquals(404, (error as HttpException).code())
    }
}