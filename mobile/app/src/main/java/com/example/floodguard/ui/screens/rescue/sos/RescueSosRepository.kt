package com.example.floodguard.ui.screens.rescue.sos

import com.example.floodguard.data.remote.dto.rescue.sos.*
import com.google.gson.JsonParser
import kotlinx.coroutines.CancellationException
import retrofit2.Response

internal enum class SosFilter(val query: String, val label: String) {
    ACTIVE("active", "Đang chờ cứu"), RESCUED("rescued", "Đã cứu")
}
internal data class RescueSos(
    val id: String, val residentId: String?, val state: String, val status: String,
    val location: SosPoint?, val initialLocation: SosPoint?,
    val locationCapturedAt: String?, val locationReceivedAt: String?,
    val situations: List<String>, val numberOfPeople: Int?, val waterLevel: String?,
    val note: String?, val completedBy: String?, val completedAt: String?,
    val createdAt: String?, val updatedAt: String?
)
internal class RescueSosFailure(val httpStatus: Int = 0, val code: String? = null,
    message: String, cause: Throwable? = null) : Exception(message, cause) {
    val accessDenied get() = httpStatus == 401 || httpStatus == 403
}
internal interface RescueSosSource {
    suspend fun list(filter: SosFilter): List<RescueSos>
    suspend fun detail(id: String): RescueSos
    suspend fun history(id: String): List<SosHistoryWire>
    suspend fun complete(id: String): RescueSos
}
internal class RescueSosRepository(private val api: RescueSosApi) : RescueSosSource {
    override suspend fun list(filter: SosFilter) = request {
        val body = read(api.list(filter.query)); require(body.success == true)
        val items = requireNotNull(body.data?.rescueRequests).map { normalize(requireNotNull(it)) }
        require(items.all { it.state == filter.query })
        require(items.map { it.id }.distinct().size == items.size)
        items
    }
    override suspend fun detail(id: String) = request {
        requireId(id)
        val body = read(api.detail(id)); require(body.success == true)
        normalize(requireNotNull(body.data?.rescueRequest)).also { require(it.id == id) }
    }
    override suspend fun history(id: String) = request {
        requireId(id)
        val body = read(api.history(id)); require(body.success == true && body.data?.requestId == id)
        requireNotNull(body.data?.statusHistory).map { row ->
            requireNotNull(row).also { require(!it.id.isNullOrBlank() && !it.newStatus.isNullOrBlank()) }
        }.also { require(it.map { row -> row.id }.distinct().size == it.size) }
    }
    override suspend fun complete(id: String) = request {
        requireId(id)
        val body = read(api.complete(id)); require(body.success == true)
        normalize(requireNotNull(body.data?.rescueRequest)).also {
            require(it.id == id && it.state == "rescued" && it.status == "assisted")
            require(!it.completedBy.isNullOrBlank() && !it.completedAt.isNullOrBlank())
        }
    }
    private fun normalize(row: SosWire): RescueSos {
        val id = requireNotNull(row.id); requireId(id)
        val state = requireNotNull(row.state); require(state in setOf("active", "rescued", "legacy_other"))
        val status = requireNotNull(row.status); require(status.isNotBlank())
        require(state != "rescued" || status == "assisted")
        require(state != "active" || status in setOf("submitted", "received", "in_progress"))
        require(row.location == null || row.location.isValid())
        require(row.initialLocation == null || row.initialLocation.isValid())
        require(row.numberOfPeople == null || row.numberOfPeople > 0)
        require(row.situations?.all { !it.isNullOrBlank() } != false)
        return RescueSos(id, row.residentId, state, status, row.location, row.initialLocation,
            row.locationCapturedAt, row.locationReceivedAt, row.situations.orEmpty().filterNotNull(),
            row.numberOfPeople, row.waterLevel, row.note, row.completedBy, row.completedAt, row.createdAt, row.updatedAt)
    }
    private fun requireId(id: String) {
        require(id.isNotBlank() && id == id.trim() && '/' !in id && id !in setOf(".", ".."))
    }
    private fun <T> read(response: Response<T>): T {
        if (!response.isSuccessful) {
            val code = runCatching {
                response.errorBody()?.use { JsonParser.parseString(it.string()).asJsonObject.get("code")?.asString }
            }.getOrNull()
            val message = when (response.code()) {
                401 -> "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại."
                403 -> "Tài khoản không có quyền cứu hộ hoặc đã bị ngừng hoạt động."
                404 -> "Không tìm thấy yêu cầu SOS này."
                409 -> "SOS đã thay đổi. Đang đọc lại trạng thái từ máy chủ."
                400 -> "Yêu cầu không hợp lệ. Vui lòng tải lại và kiểm tra."
                else -> "Chưa thể cập nhật SOS (HTTP ${response.code()})."
            }
            throw RescueSosFailure(response.code(), code, message)
        }
        return requireNotNull(response.body())
    }
    private suspend fun <T> request(block: suspend () -> T): T = try { block() }
    catch (e: CancellationException) { throw e }
    catch (e: RescueSosFailure) { throw e }
    catch (e: java.io.IOException) {
        throw RescueSosFailure(message = "Không thể kết nối máy chủ. Kiểm tra mạng rồi thử lại.", cause = e)
    } catch (e: Exception) {
        throw RescueSosFailure(message = "Máy chủ trả dữ liệu SOS không hợp lệ. Vui lòng tải lại.", cause = e)
    }
}
