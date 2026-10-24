
package com.example.floodguard.data.remote.api

import com.example.floodguard.data.remote.dto.rescue.RescueRequestListResponse
import retrofit2.Response
import retrofit2.http.GET

interface RescueRequestApi {

    @GET("api/rescue-requests")
    suspend fun getRescueRequests(): Response<RescueRequestListResponse>
}
