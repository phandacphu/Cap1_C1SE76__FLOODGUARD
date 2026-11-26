package com.example.floodguard.core.notifications

import com.example.floodguard.core.network.InstallationHttpClient
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.model.FloodWarningV2DetailResponse
import com.example.floodguard.data.model.FloodWarningV2ListResponse
import com.example.floodguard.data.remote.api.FloodWarningV2Api
import com.example.floodguard.data.repository.FloodWarningV2Repository
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Path
import retrofit2.http.Query

internal interface FloodWarningPushReadApi {
    @GET("api/flood-alerts")
    suspend fun getAlerts(
        @Header("Authorization") authorization: String,
        @Query("status") status: String?,
        @Query("q") query: String?
    ): Response<FloodWarningV2ListResponse>

    @GET("api/flood-alerts/active")
    suspend fun getActiveAlerts(
        @Header("Authorization") authorization: String
    ): Response<FloodWarningV2ListResponse>

    @GET("api/flood-alerts/{alertId}")
    suspend fun getAlert(
        @Header("Authorization") authorization: String,
        @Path("alertId") alertId: String
    ): Response<FloodWarningV2DetailResponse>
}

object FloodWarningPushRepositoryFactory {
    fun create(
        session: AuthenticatedSessionSnapshot,
        baseUrl: String? = null
    ): FloodWarningV2Repository {
        require(session.user.role == "resident")
        require(!session.user.id.isNullOrBlank())

        // Chụp JWT một lần; không đọc token tài khoản mới khi callback chạy.
        val authorization = session.authorization

        // Client này không dùng AuthInterceptor đọc token hiện hành.
        val retrofit = if (baseUrl == null) {
            InstallationHttpClient.create()
        } else {
            InstallationHttpClient.create(baseUrl)
        }

        val api = retrofit.create(FloodWarningPushReadApi::class.java)

        val adapter = object : FloodWarningV2Api {
            override suspend fun getAlerts(
                status: String?,
                query: String?
            ): Response<FloodWarningV2ListResponse> =
                api.getAlerts(authorization, status, query)

            override suspend fun getActiveAlerts():
                    Response<FloodWarningV2ListResponse> =
                api.getActiveAlerts(authorization)

            override suspend fun getAlert(
                alertId: String
            ): Response<FloodWarningV2DetailResponse> =
                api.getAlert(authorization, alertId)
        }

        return FloodWarningV2Repository(adapter)
    }
}