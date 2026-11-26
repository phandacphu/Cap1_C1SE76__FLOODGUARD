package com.example.floodguard.data.remote.api

import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PUT

interface FloodLocationV2Api {

    @PUT("api/flood-alerts/location")
    suspend fun uploadLocation(
        @Header("Authorization") authorization: String,
        @Header("X-Installation-Secret") installationSecret: String,
        @Header("X-Installation-Id") installationId: String,
        @Header("X-Device-Binding-Id") bindingId: String,
        @Body body: JsonObject
    ): Response<JsonObject>

    @GET("api/flood-alerts/location-evaluation")
    suspend fun getEvaluation(
        @Header("Authorization") authorization: String,
        @Header("X-Installation-Secret") installationSecret: String,
        @Header("X-Installation-Id") installationId: String,
        @Header("X-Device-Binding-Id") bindingId: String
    ): Response<JsonObject>
}