package com.example.floodguard.data.repository

import com.example.floodguard.data.remote.api.ResidentSosApi
import com.example.floodguard.data.remote.dto.rescue.*
import com.google.gson.Gson
import kotlinx.coroutines.CancellationException
import retrofit2.Response
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeFormatterBuilder

class ResidentSosApiException(
    val statusCode: Int,
    val code: String?,
    val activeRequestId: String?,
    message: String
) : Exception(message)

class ResidentSosResponseException(
    message: String
) : Exception(message)

class ResidentSosNetworkException(
    cause: IOException
) : Exception(
    "Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối.",
    cause
)

class ResidentSosRepository(
    private val api: ResidentSosApi
) {
    private val gson = Gson()

    suspend fun create(
        request: CreateSosRequest
    ): Result<CreatedSosDto> = execute {
        val response = api.create(request)
        checkHttp(response)

        val body = response.body()
        val created = body?.data?.rescueRequest

        if (
            response.code() != 201 ||
            body?.success != true ||
            created?.id.isNullOrBlank()
        ) {
            invalidResponse()
        }

        created!!
    }

    suspend fun getActive(): Result<List<RescueRequestDto>> =
        getRequests(state = "active")

    suspend fun getRescued(): Result<List<RescueRequestDto>> =
        getRequests(state = "rescued")

    suspend fun getRequests(
        state: String? = null
    ): Result<List<RescueRequestDto>> = execute {
        val response = api.getRequests(
            state = state,
            sort = "newest"
        )
        checkHttp(response)

        val body = response.body()
        val requests = body?.data?.rescueRequests

        if (
            body?.success != true ||
            requests == null ||
            requests.any { it == null || it.id.isNullOrBlank() }
        ) {
            invalidResponse()
        }

        val validRequests = requests.filterNotNull()

        if (validRequests.map { it.id }.distinct().size != validRequests.size) {
            invalidResponse()
        }

        validRequests
    }

    suspend fun getDetail(
        id: String
    ): Result<RescueRequestDto> = execute {
        requireId(id)
        val response = api.getDetail(id)
        checkHttp(response)
        readDetail(response, id)
    }

    suspend fun getHistory(
        id: String
    ): Result<List<SosHistoryEventDto>> = execute {
        requireId(id)
        val response = api.getHistory(id)
        checkHttp(response)

        val body = response.body()
        val data = body?.data
        val events = data?.statusHistory

        if (
            body?.success != true ||
            data?.requestId != id ||
            events == null ||
            events.any { it == null }
        ) {
            invalidResponse()
        }

        events.filterNotNull()
    }

    suspend fun updateLocation(
        id: String,
        latitude: Double,
        longitude: Double,
        capturedAtMillis: Long
    ): Result<RescueRequestDto> = execute {
        requireId(id)

        require(
            latitude.isFinite() &&
                    longitude.isFinite() &&
                    latitude in -90.0..90.0 &&
                    longitude in -180.0..180.0
        ) {
            "Tọa độ GPS không hợp lệ."
        }

        require(capturedAtMillis > 0) {
            "Thời điểm lấy mẫu GPS không hợp lệ."
        }

        val capturedAt = DateTimeFormatterBuilder()
            .appendInstant(3)
            .toFormatter()
            .format(Instant.ofEpochMilli(capturedAtMillis))

        val response = api.updateLocation(
            id = id,
            request = UpdateSosLocationRequest(
                location = CreateSosLocation(
                    latitude = latitude,
                    longitude = longitude
                ),
                capturedAt = capturedAt
            )
        )

        checkHttp(response)
        readDetail(response, id)
    }

    private fun readDetail(
        response: Response<SosDetailResponse>,
        expectedId: String
    ): RescueRequestDto {
        val body = response.body()
        val request = body?.data?.rescueRequest

        if (
            body?.success != true ||
            request?.id != expectedId
        ) {
            invalidResponse()
        }

        return request!!
    }

    private fun requireId(id: String) {
        require(id.isNotBlank() && id == id.trim()) {
            "Mã SOS không hợp lệ."
        }
    }

    private fun invalidResponse(): Nothing {
        throw ResidentSosResponseException(
            "Máy chủ trả về dữ liệu SOS không hợp lệ. " +
                    "Vui lòng kiểm tra lại trạng thái."
        )
    }

    private fun checkHttp(response: Response<*>) {
        if (response.isSuccessful) return

        val error = try {
            response.errorBody()?.string()?.let {
                gson.fromJson(it, SosErrorResponse::class.java)
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            null
        }

        val message = when (response.code()) {
            401 ->
                "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."
            403 ->
                "Tài khoản không có quyền truy cập SOS này."
            404 ->
                "Không tìm thấy yêu cầu SOS."
            409 -> when (error?.code) {
                "DUPLICATE_SOS_REQUEST" ->
                    "Bạn đã có yêu cầu SOS đang hoạt động."
                "STALE_SOS_LOCATION" ->
                    "Mẫu GPS đã cũ. Cần lấy mẫu mới."
                "SOS_NOT_ACTIVE" ->
                    "SOS không còn hoạt động. Cần tải lại trạng thái."
                "SOS_LOCATION_TIME_UNAVAILABLE" ->
                    "Chưa có dữ liệu thời gian hợp lệ để cập nhật GPS."
                else ->
                    "Dữ liệu SOS đã thay đổi. Vui lòng kiểm tra lại."
            }
            400 -> when (error?.code) {
                "INVALID_SOS_LOCATION" ->
                    "GPS hoặc thời gian lấy mẫu không hợp lệ. " +
                            "Vui lòng kiểm tra đồng hồ thiết bị."
                else ->
                    "Thông tin SOS không hợp lệ. Vui lòng kiểm tra lại."
            }
            else ->
                "Không thể xử lý yêu cầu SOS (${response.code()})."
        }

        throw ResidentSosApiException(
            statusCode = response.code(),
            code = error?.code,
            activeRequestId = error?.data?.activeRequestId
                ?.takeIf { it.isNotBlank() },
            message = message
        )
    }

    private suspend fun <T> execute(
        block: suspend () -> T
    ): Result<T> {
        return try {
            Result.success(block())
        } catch (error: CancellationException) {
            throw error
        } catch (error: IOException) {
            Result.failure(ResidentSosNetworkException(error))
        } catch (error: Exception) {
            Result.failure(error)
        }
    }
}