package com.example.floodguard.data.repository

import com.example.floodguard.data.model.FloodWarningV2Dto
import com.example.floodguard.data.model.FloodWarningV2ListResponse
import com.example.floodguard.data.remote.api.FloodWarningV2Api
import kotlinx.coroutines.CancellationException
import retrofit2.HttpException
import retrofit2.Response
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

data class FloodWarningV2(
    val id: String,
    val title: String,
    val content: String,
    val status: String,
    val scope: String,
    val startAt: String,
    val endAt: String?,
    val createdAt: String,
    val updatedAt: String,
    val revision: Long
)

class FloodWarningV2Repository(
    private val api: FloodWarningV2Api
) {
    suspend fun getAlerts(
        status: String? = null,
        query: String? = null
    ): Result<List<FloodWarningV2>> = request {
        require(status == null || status in setOf("active", "inactive")) {
            "Bộ lọc trạng thái không hợp lệ."
        }
        val search = query?.trim()?.takeIf { it.isNotEmpty() }
        require(search == null || search.length <= 180) {
            "Từ khóa quá dài."
        }
        readList(api.getAlerts(status, search), status)
    }

    suspend fun getActiveAlerts(): Result<List<FloodWarningV2>> = request {
        readList(api.getActiveAlerts(), "active")
    }

    suspend fun getAlert(id: String): Result<FloodWarningV2> = request {
        require(id.isNotBlank()) { "Thiếu mã bản tin." }
        val body = api.getAlert(id).checkedBody()
        require(body.success == true) { "Không thể đọc bản tin." }

        val alert = validate(body.data?.floodAlert)
        require(alert.id == id) { "API trả sai mã bản tin." }
        alert
    }

    private fun readList(
        response: Response<FloodWarningV2ListResponse>,
        expectedStatus: String?
    ): List<FloodWarningV2> {
        val body = response.checkedBody()
        require(body.success == true) { "Không thể đọc danh sách bản tin." }

        val data = requireNotNull(body.data) { "Thiếu dữ liệu bản tin." }
        require(data.schemaVersion == 2) {
            "Dữ liệu cảnh báo chưa đúng phiên bản V2."
        }
        val alerts = requireNotNull(data.floodAlerts) {
            "Thiếu danh sách bản tin."
        }.map(::validate)

        require(alerts.map { it.id }.distinct().size == alerts.size) {
            "Danh sách chứa mã bản tin trùng."
        }
        require(expectedStatus == null || alerts.all {
            it.status == expectedStatus
        }) { "API trả bản tin không đúng bộ lọc." }

        return alerts.sortedWith(
            compareByDescending<FloodWarningV2> { parseUtc(it.startAt) }
                .thenBy { it.id }
        )
    }

    private fun validate(dto: FloodWarningV2Dto?): FloodWarningV2 {
        val item = requireNotNull(dto) { "Bản tin không hợp lệ." }
        require(item.schemaVersion == 2) { "Bản tin không đúng V2." }

        val id = requiredText(item.id)
        val title = requiredText(item.title)
        val content = requiredText(item.content)
        require(title.length <= 180 && content.length <= 4000) {
            "Nội dung bản tin không hợp lệ."
        }
        val status = requiredText(item.status)
        require(status in setOf("active", "inactive")) {
            "Trạng thái bản tin không hợp lệ."
        }
        val scope = requiredText(item.scope)
        require(scope == "all_published_zones") {
            "Phạm vi bản tin không hợp lệ."
        }

        val startAt = requiredText(item.startAt)
        val createdAt = requiredText(item.createdAt)
        val updatedAt = requiredText(item.updatedAt)
        val start = parseUtc(startAt)
        parseUtc(createdAt)
        parseUtc(updatedAt)

        if (status == "active") {
            require(item.endAt == null) {
                "Bản tin đang bật có thời điểm kết thúc không hợp lệ."
            }
        } else {
            require(parseUtc(requiredText(item.endAt)) >= start) {
                "Thời điểm kết thúc không hợp lệ."
            }
        }

        val revision = requireNotNull(item.revision)
        require(revision > 0) { "Revision không hợp lệ." }

        return FloodWarningV2(
            id, title, content, status, scope, startAt,
            item.endAt, createdAt, updatedAt, revision
        )
    }

    private fun requiredText(value: String?): String {
        require(!value.isNullOrBlank()) { "Bản tin thiếu trường bắt buộc." }
        return value
    }

    private fun parseUtc(value: String): Long {
        val patterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'"
        )
        for (pattern in patterns) {
            val formatter = SimpleDateFormat(pattern, Locale.US).apply {
                isLenient = false
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val position = ParsePosition(0)
            val date = formatter.parse(value, position)
            if (date != null && position.index == value.length) {
                return date.time
            }
        }
        throw IllegalArgumentException("Thời gian bản tin không hợp lệ.")
    }

    private fun <T : Any> Response<T>.checkedBody(): T {
        if (!isSuccessful) throw HttpException(this)
        return requireNotNull(body()) { "API trả dữ liệu trống." }
    }

    private suspend fun <T> request(block: suspend () -> T): Result<T> {
        return try {
            Result.success(block())
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.failure(error)
        }
    }
}