package com.example.floodguard.data.remote.api

import com.example.floodguard.data.model.FloodForecastResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface FloodForecastApi {

    @GET("api/flood-forecast")
    suspend fun getForecast(
        @Query("latitude") latitude: Double,
        @Query("longitude") longitude: Double
    ): Response<FloodForecastResponse>
}