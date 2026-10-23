package com.example.floodguard.core.network

import com.example.floodguard.BuildConfig
import com.example.floodguard.core.config.AppConfig
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.remote.api.AuthApi
import com.example.floodguard.data.remote.api.FloodAlertApi
import com.example.floodguard.data.remote.api.FloodAreaApi
import com.example.floodguard.data.remote.api.SafeLocationApi
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {

    private val loggingInterceptor =
        HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

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
            .addConverterFactory(GsonConverterFactory.create())
            .build()

    val authApi: AuthApi =
        publicRetrofit.create(AuthApi::class.java)

    val floodAlertApi: FloodAlertApi =
        publicRetrofit.create(FloodAlertApi::class.java)

    val floodAreaApi: FloodAreaApi =
        publicRetrofit.create(FloodAreaApi::class.java)

    val safeLocationApi: SafeLocationApi =
        publicRetrofit.create(SafeLocationApi::class.java)

    fun createAuthenticatedRetrofit(
        sessionManager: SessionManager
    ): Retrofit {
        val authInterceptor =
            AuthInterceptor(sessionManager = sessionManager)

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
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }
}