package com.example.floodguard.data.remote.api

import com.example.floodguard.data.model.FloodAlertsResponse
import retrofit2.Response
import retrofit2.http.GET

interface FloodAlertApi {

    @GET("api/flood-alerts")
    suspend fun getFloodAlerts(): Response<FloodAlertsResponse>

    @GET("api/flood-alerts/active")
    suspend fun getActiveFloodAlerts(): Response<FloodAlertsResponse>
}