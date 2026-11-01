
package com.example.floodguard.data.remote.api

import com.example.floodguard.data.remote.dto.rescue.RescueRequestListResponse
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.CreateSosResponse
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.Response
import retrofit2.http.GET

interface RescueRequestApi {

    @GET("api/rescue-requests")
    suspend fun getRescueRequests(): Response<RescueRequestListResponse>

    @POST("api/rescue-requests")
    suspend fun createSos(
        @Body request: CreateSosRequest
    ): Response<CreateSosResponse>
}
