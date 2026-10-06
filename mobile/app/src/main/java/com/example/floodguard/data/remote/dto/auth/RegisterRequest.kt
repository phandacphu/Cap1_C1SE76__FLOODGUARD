    package com.example.floodguard.data.remote.dto.auth

    data class RegisterRequest(

        val fullName: String,

        val phone: String,

        val email: String,

        val password: String
    )