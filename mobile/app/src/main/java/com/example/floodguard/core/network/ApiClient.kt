package com.example.floodguard.core.network

import com.example.floodguard.core.config.AppConfig
import com.example.floodguard.core.datastore.UserPreferences
import com.example.floodguard.data.remote.api.AuthApi
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {

    // =================================================
    // LOGGING
    // =================================================

    private val loggingInterceptor =
        HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.NONE
        }


    // =================================================
    // PUBLIC CLIENT
    // Dùng cho Login / Register
    // =================================================

    private val publicOkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(loggingInterceptor)
            .build()


    private val publicRetrofit =
        Retrofit.Builder()
            .baseUrl(AppConfig.BASE_URL)
            .client(publicOkHttpClient)
            .addConverterFactory(
                GsonConverterFactory.create()
            )
            .build()


    // =================================================
    // AUTH API
    // =================================================

    val authApi: AuthApi =
        publicRetrofit.create(
            AuthApi::class.java
        )


    // =================================================
    // AUTHENTICATED RETROFIT
    // Dùng cho API cần Bearer Token
    // =================================================

    fun createAuthenticatedRetrofit(
        userPreferences: UserPreferences
    ): Retrofit {

        val authInterceptor =
            AuthInterceptor(
                userPreferences = userPreferences
            )

        val authenticatedClient =
            OkHttpClient.Builder()
                .connectTimeout(60, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .addInterceptor(authInterceptor)
                .addInterceptor(loggingInterceptor)
                .build()

        return Retrofit.Builder()
            .baseUrl(AppConfig.BASE_URL)
            .client(authenticatedClient)
            .addConverterFactory(
                GsonConverterFactory.create()
            )
            .build()
    }
}