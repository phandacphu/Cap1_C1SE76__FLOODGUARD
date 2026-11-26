package com.example.floodguard.data.remote.api

import com.example.floodguard.data.model.RescueFloodWarningsV2ListResponse
import com.example.floodguard.data.model.RescueFloodWarningsV2DetailResponse
import com.example.floodguard.data.model.RescueFloodWarningsV2ZonesResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface RescueFloodWarningV2Api {

    @GET("api/flood-alerts")
    suspend fun getWarnings(
        @Query("status") status: String? = null,
        @Query("q") query: String? = null
    ): Response<RescueFloodWarningsV2ListResponse>

    @GET("api/flood-alerts/active")
    suspend fun getActiveWarnings():
        Response<RescueFloodWarningsV2ListResponse>

    @GET("api/flood-alerts/zones")
    suspend fun getZones():
        Response<RescueFloodWarningsV2ZonesResponse>

    @GET("api/flood-alerts/{alertId}")
    suspend fun getWarningDetail(
        @Path("alertId") alertId: String
    ): Response<RescueFloodWarningsV2DetailResponse>
}
