package com.example.floodguard.core.network

import com.example.floodguard.core.config.AppConfig
import com.google.gson.GsonBuilder
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

object InstallationHttpClient {

    fun create(baseUrl: String = AppConfig.BASE_URL): Retrofit {
        val url = baseUrl.toHttpUrl()

        require(
            url.encodedPath == "/" &&
                    url.query == null &&
                    url.fragment == null
        ) {
            "Base URL phải là host gốc, không chứa /api."
        }

        require(
            url.isHttps ||
                    url.host in setOf("localhost", "127.0.0.1", "::1")
        ) {
            "API installation yêu cầu HTTPS ngoài loopback."
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .followRedirects(false)
            .followSslRedirects(false)
            .build()

        return Retrofit.Builder()
            .baseUrl(url)
            .client(client)
            .addConverterFactory(
                GsonConverterFactory.create(
                    GsonBuilder()
                        .serializeNulls()
                        .create()
                )
            )
            .build()
    }

    fun retryAfterMillis(value: String?): Long? {
        val text = value?.trim() ?: return null

        text.toLongOrNull()?.let { seconds ->
            if (seconds < 0) return null

            return try {
                Math.multiplyExact(seconds, 1_000L)
            } catch (_: ArithmeticException) {
                Long.MAX_VALUE
            }
        }

        return runCatching {
            val target = ZonedDateTime.parse(
                text,
                DateTimeFormatter.RFC_1123_DATE_TIME
            ).toInstant().toEpochMilli()

            (target - System.currentTimeMillis()).coerceAtLeast(0L)
        }.getOrNull()
    }
}