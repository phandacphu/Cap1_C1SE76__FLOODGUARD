
package com.example.floodguard.data.remote.api

import com.example.floodguard.data.model.FloodHistoryResponse
import retrofit2.Response
import retrofit2.http.GET

interface FloodHistoryApi {

    @GET("api/flood-history/points")
    suspend fun getPoints(): Response<FloodHistoryResponse>

    @GET("api/flood-history/areas")
    suspend fun getAreas(): Response<FloodHistoryResponse>
    @GET("api/flood-history/buffers")
    suspend fun getBuffers(): Response<FloodHistoryResponse>

    @GET("api/flood-history/radar")
    suspend fun getRadar(): Response<FloodHistoryResponse>
}
