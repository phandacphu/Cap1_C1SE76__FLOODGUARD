package com.example.floodguard.data.remote.api

import com.example.floodguard.data.model.FloodWarningV2DetailResponse
import com.example.floodguard.data.model.FloodWarningV2ListResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface FloodWarningV2Api {
    @GET("api/flood-alerts")
    suspend fun getAlerts(
        @Query("status") status: String? = null,
        @Query("q") query: String? = null
    ): Response<FloodWarningV2ListResponse>

    @GET("api/flood-alerts/active")
    suspend fun getActiveAlerts(): Response<FloodWarningV2ListResponse>

    @GET("api/flood-alerts/{alertId}")
    suspend fun getAlert(
        @Path("alertId") alertId: String
    ): Response<FloodWarningV2DetailResponse>
}