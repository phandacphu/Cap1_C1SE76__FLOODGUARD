package com.example.floodguard.data.repository

import com.example.floodguard.data.model.RescueFloodWarningV2Dto
import com.example.floodguard.data.model.RescueFloodWarningsV2ListResponse
import com.example.floodguard.data.remote.api.RescueFloodWarningV2Api
import com.google.gson.JsonParseException
import com.google.gson.stream.MalformedJsonException
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.CancellationException
import retrofit2.Response

data class RescueFloodWarningV2(
    val id: String,
    val title: String,
    val content: String,
    val status: String,
    val scope: String,
    val startAt: Instant,
    val endAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val revision: Int
) {
    val isActive: Boolean
        get() = status == "active"
}

enum class RescueWarningV2FailureKind {
    INVALID_REQUEST,
    INVALID_RESPONSE,
    UNAUTHORIZED,
    FORBIDDEN,
    NOT_FOUND,
    SERVER,
    NETWORK,
    HTTP
}

sealed interface RescueWarningV2Result<out T> {
    data class Success<T>(
        val data: T
    ) : RescueWarningV2Result<T>

    data class Failure(
        val kind: RescueWarningV2FailureKind,
        val message: String
    ) : RescueWarningV2Result<Nothing>
}

class RescueFloodWarningV2Repository(
    private val api: RescueFloodWarningV2Api
) {

    suspend fun getWarnings(
        status: String? = null,
        query: String? = null
    ): RescueWarningV2Result<List<RescueFloodWarningV2>> {

        if (status != null && status !in setOf("active", "inactive")) {
            return failure(
                RescueWarningV2FailureKind.INVALID_REQUEST,
                "Bộ lọc trạng thái không hợp lệ."
            )
        }

        val cleanQuery = query?.trim()?.takeIf { it.isNotEmpty() }

        if (cleanQuery != null && cleanQuery.length > 180) {
            return failure(
                RescueWarningV2FailureKind.INVALID_REQUEST,
                "Từ khóa tìm kiếm quá dài."
            )
        }

        return safely {
            parseList(
                api.getWarnings(status, cleanQuery),
                requiredStatus = status
            )
        }
    }

    suspend fun getActiveWarnings():
        RescueWarningV2Result<List<RescueFloodWarningV2>> =
        safely {
            parseList(
                api.getActiveWarnings(),
                requiredStatus = "active"
            )
        }

    suspend fun getDetail(
        alertId: String
    ): RescueWarningV2Result<RescueFloodWarningV2> {

        if (alertId.isBlank()) {
            return failure(
                RescueWarningV2FailureKind.INVALID_REQUEST,
                "ID bản tin không hợp lệ."
            )
        }

        return safely {
            val response = api.getWarningDetail(alertId)

            if (!response.isSuccessful) {
                return@safely httpFailure(
                    response.code(),
                    isDetail = true
                )
            }

            val body = response.body()
            val data = body?.data

            if (
                body?.success != true ||
                parseUtc(data?.serverTime) == null
            ) {
                return@safely invalidResponse()
            }

            val warning = data?.floodAlert.toWarning()
                ?: return@safely invalidResponse()

            if (warning.id != alertId) {
                return@safely invalidResponse()
            }

            RescueWarningV2Result.Success(warning)
        }
    }

    private fun parseList(
        response: Response<RescueFloodWarningsV2ListResponse>,
        requiredStatus: String?
    ): RescueWarningV2Result<List<RescueFloodWarningV2>> {

        if (!response.isSuccessful) {
            return httpFailure(response.code())
        }

        val body = response.body()
        val data = body?.data

        if (
            body?.success != true ||
            data?.schemaVersion != 2 ||
            parseUtc(data.serverTime) == null
        ) {
            return invalidResponse()
        }

        val items = data.floodAlerts
            ?: return invalidResponse()

        val warnings = mutableListOf<RescueFloodWarningV2>()

        for (dto in items) {
            val warning = dto.toWarning()
                ?: return invalidResponse()

            if (
                requiredStatus != null &&
                warning.status != requiredStatus
            ) {
                return invalidResponse()
            }

            warnings.add(warning)
        }

        return RescueWarningV2Result.Success(
            warnings.sortedWith(
                compareByDescending<RescueFloodWarningV2> {
                    it.startAt
                }.thenBy { it.id }
            )
        )
    }

    private suspend fun <T> safely(
        block: suspend () -> RescueWarningV2Result<T>
    ): RescueWarningV2Result<T> {
        return try {
            block()
        } catch (error: CancellationException) {
            throw error
        } catch (error: JsonParseException) {
            invalidResponse()
        } catch (error: MalformedJsonException) {
            invalidResponse()
        } catch (error: IOException) {
            failure(
                RescueWarningV2FailureKind.NETWORK,
                "Không thể kết nối máy chủ. Vui lòng thử lại."
            )
        } catch (error: Exception) {
            invalidResponse()
        }
    }

    private fun httpFailure(
        code: Int,
        isDetail: Boolean = false
    ): RescueWarningV2Result.Failure =
        when (code) {
            401 -> failure(
                RescueWarningV2FailureKind.UNAUTHORIZED,
                "Phiên đăng nhập không hợp lệ."
            )
            403 -> failure(
                RescueWarningV2FailureKind.FORBIDDEN,
                "Bạn không có quyền truy cập cảnh báo."
            )
            404 -> failure(
                RescueWarningV2FailureKind.NOT_FOUND,
                if (isDetail) {
                    "Bản tin không còn truy cập được."
                } else {
                    "Không tìm thấy API cảnh báo."
                }
            )
            in 500..599 -> failure(
                RescueWarningV2FailureKind.SERVER,
                "Máy chủ đang gặp sự cố."
            )
            else -> failure(
                RescueWarningV2FailureKind.HTTP,
                "Không thể tải cảnh báo (HTTP $code)."
            )
        }

    private fun invalidResponse() = failure(
        RescueWarningV2FailureKind.INVALID_RESPONSE,
        "Dữ liệu cảnh báo V2 từ máy chủ không hợp lệ."
    )

    private fun failure(
        kind: RescueWarningV2FailureKind,
        message: String
    ) = RescueWarningV2Result.Failure(kind, message)
}

private fun parseUtc(value: String?): Instant? {
    if (value.isNullOrBlank() || !value.endsWith("Z")) {
        return null
    }

    return runCatching {
        Instant.parse(value)
    }.getOrNull()
}

private fun RescueFloodWarningV2Dto?.toWarning():
    RescueFloodWarningV2? {

    val dto = this ?: return null

    if (
        dto.schemaVersion != 2 ||
        dto.scope != "all_published_zones" ||
        dto.status !in setOf("active", "inactive")
    ) {
        return null
    }

    val id = dto.id?.takeIf { it.isNotBlank() }
        ?: return null

    val title = dto.title?.takeIf { it.isNotBlank() }
        ?: return null

    val content = dto.content?.takeIf { it.isNotBlank() }
        ?: return null

    val startAt = parseUtc(dto.startAt)
        ?: return null

    val createdAt = parseUtc(dto.createdAt)
        ?: return null

    val updatedAt = parseUtc(dto.updatedAt)
        ?: return null

    val revision = dto.revision
        ?.takeIf { it > 0 }
        ?: return null

    val endAt = if (dto.endAt == null) {
        null
    } else {
        parseUtc(dto.endAt) ?: return null
    }

    if (dto.status == "active" && endAt != null) {
        return null
    }

    if (dto.status == "inactive" && endAt == null) {
        return null
    }

    if (endAt != null && endAt.isBefore(startAt)) {
        return null
    }

    return RescueFloodWarningV2(
        id = id,
        title = title,
        content = content,
        status = dto.status ?: return null,
        scope = dto.scope,
        startAt = startAt,
        endAt = endAt,
        createdAt = createdAt,
        updatedAt = updatedAt,
        revision = revision
    )
}
