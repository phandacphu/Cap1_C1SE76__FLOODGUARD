package com.example.floodguard.data.remote.api

import com.example.floodguard.data.model.RescueSafeLocationsResponse
import com.example.floodguard.data.model.RescueSafeLocationDetailResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface RescueSafeLocationApi {

    @GET("api/safe-locations")
    suspend fun getSafeLocations(
        @Query("latitude") latitude: Double? = null,
        @Query("longitude") longitude: Double? = null
    ): Response<RescueSafeLocationsResponse>

    @GET("api/safe-locations/{id}")
    suspend fun getSafeLocationDetail(
        @Path("id") id: String,
        @Query("latitude") latitude: Double? = null,
        @Query("longitude") longitude: Double? = null
    ): Response<RescueSafeLocationDetailResponse>
}
