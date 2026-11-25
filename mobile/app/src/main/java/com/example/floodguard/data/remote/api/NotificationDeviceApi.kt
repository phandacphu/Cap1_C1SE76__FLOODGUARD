package com.example.floodguard.data.remote.api

import com.google.gson.JsonNull
import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PUT
import retrofit2.http.Path
import java.util.UUID

interface NotificationDeviceApi {

    @GET("api/notification-devices/{installationId}")
    suspend fun getInstallation(
        @Path("installationId") installationId: String,
        @Header("Authorization") authorization: String,
        @Header("X-Installation-Secret") installationSecret: String
    ): Response<JsonObject>

    @PUT("api/notification-devices/{installationId}")
    suspend fun registerInstallation(
        @Path("installationId") installationId: String,
        @Header("Authorization") authorization: String,
        @Header("X-Installation-Secret") installationSecret: String,
        @Body body: JsonObject
    ): Response<JsonObject>

    @DELETE("api/notification-devices/{installationId}")
    suspend fun deleteInstallation(
        @Path("installationId") installationId: String,
        @Header("Authorization") authorization: String,
        @Header("X-Installation-Secret") installationSecret: String,
        @Header("X-Installation-Id") installationIdHeader: String,
        @Header("X-Device-Binding-Id") bindingId: String
    ): Response<JsonObject>
}

data class NotificationDeviceRegistration(
    val fcmToken: String?,
    val notificationPermission: String,
    val registrationId: String,
    val expectedBindingId: String?,
    val expectedRevision: Long
) {

    override fun toString(): String =
        "NotificationDeviceRegistration(redacted)"

    fun toJson(): JsonObject {
        require(
            notificationPermission in setOf(
                "granted",
                "denied",
                "unknown"
            )
        ) {
            "Trạng thái quyền thông báo không hợp lệ."
        }

        val registrationUuid = UUID.fromString(registrationId)
        require(
            registrationUuid.version() == 4 &&
                    registrationUuid.variant() == 2 &&
                    registrationUuid.toString()
                        .equals(registrationId, ignoreCase = true)
        ) {
            "registrationId phải là UUIDv4."
        }

        require(expectedRevision >= 0)

        if (expectedBindingId == null) {
            require(expectedRevision == 0L)
        } else {
            require(expectedBindingId.isNotBlank())
            require(expectedRevision > 0L)
        }

        fcmToken?.let { token ->
            require(token.length in 1..4096)
            require(token.all { it.code in 33..126 }) {
                "FCM token không được chứa khoảng trắng."
            }
        }

        return JsonObject().apply {
            addProperty("platform", "android")

            if (fcmToken == null) {
                add("fcmToken", JsonNull.INSTANCE)
            } else {
                addProperty("fcmToken", fcmToken)
            }

            addProperty(
                "notificationPermission",
                notificationPermission
            )
            addProperty("registrationId", registrationId)

            if (expectedBindingId == null) {
                add("expectedBindingId", JsonNull.INSTANCE)
            } else {
                addProperty("expectedBindingId", expectedBindingId)
            }

            addProperty("expectedRevision", expectedRevision)
        }
    }
}