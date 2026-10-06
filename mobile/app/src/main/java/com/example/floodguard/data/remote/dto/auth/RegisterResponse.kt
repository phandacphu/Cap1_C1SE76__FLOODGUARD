package com.example.floodguard.data.remote.dto.auth

data class RegisterResponse(
    val success: Boolean,
    val message: String?,
    val data: RegisterData?
)

data class RegisterData(
    val user: UserDto?
)