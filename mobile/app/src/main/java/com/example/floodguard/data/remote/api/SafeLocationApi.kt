package com.example.floodguard.data.remote.api

import com.example.floodguard.data.model.SafeLocationDetailResponse
import com.example.floodguard.data.model.SafeLocationsResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface SafeLocationApi {

    @GET("api/safe-locations")
    suspend fun getSafeLocations(
        @Query("latitude") latitude: Double? = null,
        @Query("longitude") longitude: Double? = null
    ): Response<SafeLocationsResponse>

    @GET("api/safe-locations/{id}")
    suspend fun getSafeLocation(
        @Path("id") id: String,
        @Query("latitude") latitude: Double? = null,
        @Query("longitude") longitude: Double? = null
    ): Response<SafeLocationDetailResponse>

    @GET("api/safe-locations/nearby")
    suspend fun getNearbySafeLocations(
        @Query("latitude") latitude: Double,
        @Query("longitude") longitude: Double,
        @Query("radiusKm") radiusKm: Double = 10.0,
        @Query("type") type: String? = null
    ): Response<SafeLocationsResponse>
}