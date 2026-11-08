package com.example.floodguard.data.remote.api

import com.example.floodguard.data.remote.dto.rescue.*
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ResidentSosApi {
    @POST("rescue-requests")
    suspend fun create(
        @Body request: CreateSosRequest
    ): Response<CreateSosResponse>

    @GET("rescue-requests")
    suspend fun getRequests(
        @Query("state") state: String? = null,
        @Query("sort") sort: String = "newest"
    ): Response<RescueRequestListResponse>

    @GET("rescue-requests/{id}")
    suspend fun getDetail(
        @Path("id") id: String
    ): Response<SosDetailResponse>

    @GET("rescue-requests/{id}/history")
    suspend fun getHistory(
        @Path("id") id: String
    ): Response<SosHistoryResponse>

    @PATCH("rescue-requests/{id}/location")
    suspend fun updateLocation(
        @Path("id") id: String,
        @Body request: UpdateSosLocationRequest
    ): Response<SosDetailResponse>
}