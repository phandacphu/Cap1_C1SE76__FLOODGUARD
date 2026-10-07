package com.example.floodguard.data.remote.api

import com.example.floodguard.data.remote.dto.auth.LoginRequest
import com.example.floodguard.data.remote.dto.auth.LoginResponse
import com.example.floodguard.data.remote.dto.auth.RegisterRequest
import com.example.floodguard.data.remote.dto.auth.RegisterResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface AuthApi {

    @POST("api/auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<LoginResponse>

    @POST("api/auth/register")
    suspend fun register(
        @Body request: RegisterRequest
    ): Response<RegisterResponse>
}