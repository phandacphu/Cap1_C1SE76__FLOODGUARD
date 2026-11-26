package com.example.floodguard.data.repository

import com.example.floodguard.core.config.AppConfig
import com.example.floodguard.core.network.InstallationHttpClient
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.model.FloodLocationV2Evaluation
import com.example.floodguard.data.model.FloodLocationV2Upload
import com.example.floodguard.data.model.parseFloodLocationV2Evaluation
import com.example.floodguard.data.remote.api.FloodLocationV2Api
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.CancellationException
import retrofit2.Response

class FloodLocationV2ApiException(
    val httpStatus: Int,
    val errorCode: String?,
    val retryAfterMillis: Long?
) : Exception("Không thể đồng bộ vị trí (HTTP $httpStatus).")

class FloodLocationV2Repository(
    private val api: FloodLocationV2Api
) {
    companion object {
        fun create(
            baseUrl: String = AppConfig.BASE_URL
        ): FloodLocationV2Repository =
            FloodLocationV2Repository(
                InstallationHttpClient.create(baseUrl)
                    .create(FloodLocationV2Api::class.java)
            )
    }

    suspend fun uploadLocation(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding,
        upload: FloodLocationV2Upload
    ): Result<FloodLocationV2Evaluation> = request {
        validateContext(session, identity, binding)

        val payload = upload.toJson()
        val sentAtMillis = System.currentTimeMillis()

        val response = api.uploadLocation(
            authorization = session.authorization,
            installationSecret = identity.installationSecret,
            installationId = identity.installationId,
            bindingId = binding.bindingId,
            body = payload
        )

        if (
            com.example.floodguard.BuildConfig.DEBUG &&
            !response.isSuccessful
        ) {
            runCatching {
                val capturedMillis = payload.get("capturedAt")
                    ?.takeUnless { it.isJsonNull }
                    ?.asString
                    ?.let { java.time.Instant.parse(it).toEpochMilli() }

                val serverMillis = response.headers()["Date"]?.let {
                    runCatching {
                        java.time.ZonedDateTime.parse(
                            it,
                            java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME
                        ).toInstant().toEpochMilli()
                    }.getOrNull()
                }

                val sampleAgeAtSendMs =
                    capturedMillis?.let { sentAtMillis - it }

                val capturedMinusResponseDateMs =
                    if (capturedMillis != null && serverMillis != null) {
                        capturedMillis - serverMillis
                    } else {
                        null
                    }

                android.util.Log.i(
                    "FloodLocationApi",
                    "sampleSequence=${upload.sequence}; " +
                            "availability=${payload.get("availability").asString}; " +
                            "sampleAgeAtSendMs=$sampleAgeAtSendMs; " +
                            "capturedMinusResponseDateMs=$capturedMinusResponseDateMs"
                )
            }
        }

        val root = checkedRoot(response)

        parse(
            root = root,
            identity = identity,
            binding = binding,
            minimumSequence = upload.sequence
        )
    }

    suspend fun getEvaluation(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding,
        minimumSequence: Long? = null
    ): Result<FloodLocationV2Evaluation> = request {
        validateContext(session, identity, binding)
        require(minimumSequence == null || minimumSequence >= 0L)

        val root = checkedRoot(
            api.getEvaluation(
                authorization = session.authorization,
                installationSecret = identity.installationSecret,
                installationId = identity.installationId,
                bindingId = binding.bindingId
            )
        )

        parse(root, identity, binding, minimumSequence)
    }

    private fun parse(
        root: JsonObject,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding,
        minimumSequence: Long?
    ): FloodLocationV2Evaluation {
        val evaluation = parseFloodLocationV2Evaluation(
            root = root,
            expectedInstallationId = identity.installationId,
            expectedBindingId = binding.bindingId
        )

        if (minimumSequence != null && minimumSequence > 0L) {
            require(
                evaluation.sequence != null &&
                        evaluation.sequence >= minimumSequence
            ) {
                "Evaluation thuộc mẫu vị trí cũ."
            }
        }

        return evaluation
    }

    private fun validateContext(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding
    ) {
        require(session.user.role == "resident")
        require(!session.user.id.isNullOrBlank())
        require(session.accessToken.isNotBlank())

        require(binding.installationId == identity.installationId)
        require(binding.bindingId.isNotBlank())
        require(binding.revision > 0L)
    }

    private fun checkedRoot(
        response: Response<JsonObject>
    ): JsonObject {
        if (!response.isSuccessful) {
            val code = try {
                val raw = response.errorBody()?.use { it.string() }
                val value = raw?.let {
                    JsonParser.parseString(it).asJsonObject.get("code")
                }

                if (
                    value != null &&
                    value.isJsonPrimitive &&
                    value.asJsonPrimitive.isString
                ) {
                    value.asString
                } else {
                    null
                }
            } catch (_: Exception) {
                null
            }

            if (com.example.floodguard.BuildConfig.DEBUG) {
                val safeCode = code
                    ?.takeIf { it.matches(Regex("[A-Z0-9_]{1,80}")) }
                    ?: "UNKNOWN"

                runCatching {
                    android.util.Log.i(
                        "FloodLocationApi",
                        "method=${response.raw().request.method}; " +
                                "httpStatus=${response.code()}; code=$safeCode"
                    )
                }
            }

            throw FloodLocationV2ApiException(
                httpStatus = response.code(),
                errorCode = code,
                retryAfterMillis = InstallationHttpClient.retryAfterMillis(
                    response.headers()["Retry-After"]
                )
            )
        }

        return requireNotNull(response.body()) {
            "API vị trí không có nội dung."
        }
    }

    private suspend fun <T> request(
        block: suspend () -> T
    ): Result<T> {
        return try {
            Result.success(block())
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.failure(error)
        }
    }
}