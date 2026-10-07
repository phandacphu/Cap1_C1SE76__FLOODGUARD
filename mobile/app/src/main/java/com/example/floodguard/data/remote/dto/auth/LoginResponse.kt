package com.example.floodguard.data.remote.dto.auth

data class LoginResponse(
    val success: Boolean,
    val message: String?,
    val data: LoginData?
)

data class LoginData(
    val token: String?,
    val user: UserDto?
)

data class UserDto(
    val id: String?,
    val fullName: String?,
    val email: String?,
    val phone: String?,
    val role: String?
)