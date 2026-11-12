package com.example.floodguard.data.remote.dto.rescue.sos

import retrofit2.Response
import retrofit2.http.*

// Deliberately separate from the shared Resident interface.
internal interface RescueSosApi {
    @GET("api/rescue-requests")
    suspend fun list(@Query("state") state: String, @Query("sort") sort: String = "newest"): Response<SosListEnvelope>
    @GET("api/rescue-requests/{id}")
    suspend fun detail(@Path("id") id: String): Response<SosDetailEnvelope>
    @GET("api/rescue-requests/{id}/history")
    suspend fun history(@Path("id") id: String): Response<SosHistoryEnvelope>
    @PATCH("api/rescue-requests/{id}/status")
    suspend fun complete(@Path("id") id: String, @Body body: CompleteSosBody = CompleteSosBody()): Response<SosDetailEnvelope>
}
internal data class CompleteSosBody(val status: String = "assisted")
internal data class SosListEnvelope(val success: Boolean? = null, val data: SosListData? = null)
internal data class SosListData(val rescueRequests: List<SosWire?>? = null)
internal data class SosDetailEnvelope(val success: Boolean? = null, val data: SosDetailData? = null)
internal data class SosDetailData(val rescueRequest: SosWire? = null)
internal data class SosHistoryEnvelope(val success: Boolean? = null, val data: SosHistoryData? = null)
internal data class SosHistoryData(val requestId: String? = null, val statusHistory: List<SosHistoryWire?>? = null)
internal data class SosPoint(val latitude: Double? = null, val longitude: Double? = null) {
    fun isValid() = latitude?.let { it.isFinite() && it in -90.0..90.0 } == true &&
        longitude?.let { it.isFinite() && it in -180.0..180.0 } == true
}
internal data class SosWire(
    val id: String? = null, val residentId: String? = null,
    val status: String? = null, val state: String? = null,
    val location: SosPoint? = null, val initialLocation: SosPoint? = null,
    val locationCapturedAt: String? = null, val locationReceivedAt: String? = null,
    val situations: List<String?>? = null, val numberOfPeople: Int? = null,
    val waterLevel: String? = null, val note: String? = null,
    val completedBy: String? = null, val completedAt: String? = null,
    val createdAt: String? = null, val updatedAt: String? = null
)
internal data class SosHistoryWire(
    val id: String? = null, val oldStatus: String? = null, val newStatus: String? = null,
    val changedBy: String? = null, val changedAt: String? = null, val note: String? = null
)
