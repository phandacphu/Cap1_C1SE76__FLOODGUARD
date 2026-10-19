package com.example.floodguard.data.remote.api

import com.example.floodguard.data.model.FloodAreasResponse
import retrofit2.Response
import retrofit2.http.GET

interface FloodAreaApi {

    @GET("api/flood-areas")
    suspend fun getFloodAreas(): Response<FloodAreasResponse>
}