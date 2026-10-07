package com.example.floodguard.data.remote.dto.auth

data class LoginRequest(
    val identifier: String,
    val password: String
)