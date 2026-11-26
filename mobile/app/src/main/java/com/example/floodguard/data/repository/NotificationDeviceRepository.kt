package com.example.floodguard.data.repository

import com.example.floodguard.core.config.AppConfig
import com.example.floodguard.core.network.InstallationHttpClient
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.remote.api.NotificationDeviceApi
import com.example.floodguard.data.remote.api.NotificationDeviceRegistration
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.GsonBuilder
import kotlinx.coroutines.CancellationException
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

data class NotificationInstallationState(
    val installationId: String,
    val bindingId: String?,
    val revision: Long,
    val active: Boolean,
    val boundToCurrentAccount: Boolean
)

data class ConfirmedNotificationDevice(
    val installationId: String,
    val bindingId: String,
    val revision: Long,
    val notificationPermission: String,
    val pushEligible: Boolean
)

class NotificationDeviceApiException(
    val httpStatus: Int,
    val errorCode: String?,
    val retryAfterMillis: Long? = null
) : Exception("Không thể cập nhật thiết bị (HTTP $httpStatus).")

/*
 * Chỉ thực hiện request bằng snapshot đã nhận.
 * Coordinator sẽ kiểm tra generation trước/sau request,
 * xếp tuần tự thao tác và lưu body retry.
 */
class NotificationDeviceRepository(
    private val api: NotificationDeviceApi
) {
    companion object {
        fun create(
            baseUrl: String = AppConfig.BASE_URL
        ): NotificationDeviceRepository =
            NotificationDeviceRepository(
                InstallationHttpClient.create(baseUrl)
                    .create(NotificationDeviceApi::class.java)
            )
    }

    suspend fun getInstallation(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity
    ): Result<NotificationInstallationState> = request("GET_INSTALLATION") {
        requireResident(session)

        val data = checkedData(
            api.getInstallation(
                installationId = identity.installationId,
                authorization = session.authorization,
                installationSecret = identity.installationSecret
            )
        )

        val installation = data.deviceObject("installation")
        val installationId = installation.deviceText("installationId")
        require(installationId == identity.installationId)

        val bindingId = installation.deviceNullableText("bindingId")
        val revision = installation.deviceRevision("revision")
        val active = installation.deviceBoolean("active")
        val boundToCurrentAccount =
            installation.deviceBoolean("boundToCurrentAccount")

        if (bindingId == null) {
            require(revision == 0L && !active && !boundToCurrentAccount)
        } else {
            require(bindingId.isNotBlank() && revision > 0L)
        }

        NotificationInstallationState(
            installationId = installationId,
            bindingId = bindingId,
            revision = revision,
            active = active,
            boundToCurrentAccount = boundToCurrentAccount
        )
    }

    suspend fun register(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        registration: NotificationDeviceRegistration
    ): Result<ConfirmedNotificationDevice> = request("REGISTER_INSTALLATION") {
        requireResident(session)
        require(registration.registrationId == session.registrationId) {
            "Thao tác đăng ký không thuộc phiên đã chốt."
        }

        val data = checkedData(
            api.registerInstallation(
                installationId = identity.installationId,
                authorization = session.authorization,
                installationSecret = identity.installationSecret,
                body = registration.toJson()
            )
        )

        val device = data.deviceObject("device")
        val installationId = device.deviceText("installationId")
        require(installationId == identity.installationId)
        require(device.deviceText("platform") == "android")

        val bindingId = device.deviceText("bindingId")
        val revision = device.deviceRevision("revision")
        require(revision > 0L)

        val permission = device.deviceText("notificationPermission")
        require(permission in setOf("granted", "denied", "unknown"))

        ConfirmedNotificationDevice(
            installationId = installationId,
            bindingId = bindingId,
            revision = revision,
            notificationPermission = permission,
            pushEligible = device.deviceBoolean("pushEligible")
        )
    }

    suspend fun deleteBinding(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        bindingId: String
    ): Result<Unit> = request("DELETE_BINDING") {
        requireResident(session)
        require(bindingId.isNotBlank())

        val data = checkedData(
            api.deleteInstallation(
                installationId = identity.installationId,
                authorization = session.authorization,
                installationSecret = identity.installationSecret,
                installationIdHeader = identity.installationId,
                bindingId = bindingId
            )
        )

        require(
            data.deviceText("installationId") == identity.installationId
        )
        require(data.deviceText("bindingId") == bindingId)
        require(data.deviceBoolean("unbound"))
        Unit
    }

    private fun requireResident(session: AuthenticatedSessionSnapshot) {
        require(session.user.role == "resident")
        require(!session.user.id.isNullOrBlank())
        require(session.accessToken.isNotBlank())
    }

    private fun checkedData(response: Response<JsonObject>): JsonObject {
        if (!response.isSuccessful) {
            val code = try {
                val raw = response.errorBody()?.use { it.string() }
                raw?.let {
                    JsonParser.parseString(it)
                        .asJsonObject
                        .deviceNullableText("code")
                }
            } catch (_: Exception) {
                null
            }

            throw NotificationDeviceApiException(
                httpStatus = response.code(),
                errorCode = code,
                retryAfterMillis = deviceRetryAfterMillis(
                    response.headers()["Retry-After"]
                )
            )
        }

        val body = requireNotNull(response.body()) {
            "API thiết bị không có nội dung."
        }
        require(body.deviceBoolean("success")) {
            "API thiết bị chưa trả kết quả thành công."
        }

        return body.deviceObject("data")
    }

        private suspend fun <T> request(
            operation: String,
            block: suspend () -> T
        ): Result<T> {
            return try {
                Result.success(block())
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (com.example.floodguard.BuildConfig.DEBUG) {
                    val category = when (error) {
                        is NotificationDeviceApiException -> "HTTP"
                        is java.net.UnknownHostException -> "DNS"
                        is java.net.SocketTimeoutException -> "TIMEOUT"
                        is javax.net.ssl.SSLException -> "TLS"
                        is com.google.gson.JsonParseException -> "JSON"
                        is java.io.IOException -> "NETWORK"
                        is IllegalArgumentException -> "VALIDATION"
                        is IllegalStateException -> "INVALID_STATE"
                        else -> "OTHER"
                    }

                    val httpStatus =
                        (error as? NotificationDeviceApiException)?.httpStatus

                    runCatching {
                        android.util.Log.i(
                            "NotificationDevice",
                            "operation=$operation; category=$category; " +
                                    "exception=${error.javaClass.simpleName}; " +
                                    "httpStatus=${httpStatus ?: "none"}"
                        )
                    }
                }

                Result.failure(error)
            }
        }
}

private fun JsonObject.deviceObject(key: String): JsonObject {
    val value = requireNotNull(get(key)) { "Thiếu $key." }
    require(value.isJsonObject)
    return value.asJsonObject
}

private fun JsonObject.deviceNullableText(key: String): String? {
    val value = requireNotNull(get(key)) { "Thiếu $key." }
    if (value.isJsonNull) return null
    require(value.isJsonPrimitive && value.asJsonPrimitive.isString)
    return value.asString
}

private fun JsonObject.deviceText(key: String): String =
    requireNotNull(deviceNullableText(key)).also {
        require(it.isNotBlank())
    }

private fun JsonObject.deviceBoolean(key: String): Boolean {
    val value = requireNotNull(get(key)) { "Thiếu $key." }
    require(value.isJsonPrimitive && value.asJsonPrimitive.isBoolean)
    return value.asBoolean
}

private fun JsonObject.deviceRevision(key: String): Long {
    val value = requireNotNull(get(key)) { "Thiếu $key." }
    require(value.isJsonPrimitive && value.asJsonPrimitive.isNumber)

    return value.asBigDecimal.longValueExact().also {
        require(it >= 0L)
    }
}

private fun deviceRetryAfterMillis(value: String?): Long? =
    InstallationHttpClient.retryAfterMillis(value)
