package com.example.floodguard.data.remote.api

import retrofit2.Response
import retrofit2.http.GET

interface RescueProfileApi {

    @GET("api/auth/me")
    suspend fun getProfile(): Response<RescueProfileResponse>
}

data class RescueProfileResponse(
    val success: Boolean = false,
    val message: String? = null,
    val data: RescueProfileData? = null
)

data class RescueProfileData(
    val user: RescueProfileDto? = null
)

data class RescueProfileDto(
    val id: String? = null,
    val fullName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val role: String? = null,
    val isActive: Boolean? = null
)