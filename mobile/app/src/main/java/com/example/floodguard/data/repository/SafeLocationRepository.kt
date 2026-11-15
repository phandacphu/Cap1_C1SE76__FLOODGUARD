package com.example.floodguard.data.repository

import com.example.floodguard.data.model.SafeLocationDto
import com.example.floodguard.data.remote.api.SafeLocationApi
import kotlinx.coroutines.CancellationException
import retrofit2.HttpException

class SafeLocationRepository(
    private val safeLocationApi: SafeLocationApi
) {
    suspend fun getSafeLocations(
        latitude: Double? = null,
        longitude: Double? = null
    ): Result<List<SafeLocationDto>> = safeLocationResult {
        validateCoordinates(latitude, longitude)

        val response = safeLocationApi.getSafeLocations(latitude, longitude)
        if (!response.isSuccessful) throw HttpException(response)

        val body = response.body()
        check(body?.success == true) {
            body?.message ?: "Chưa thể cập nhật điểm tránh trú"
        }

        checkNotNull(body.data?.safeLocations) {
            "Phản hồi thiếu danh sách điểm tránh trú"
        }
    }

    suspend fun getSafeLocation(
        id: String,
        latitude: Double? = null,
        longitude: Double? = null
    ): Result<SafeLocationDto> = safeLocationResult {
        require(id.isNotBlank()) { "Mã điểm tránh trú không hợp lệ" }
        validateCoordinates(latitude, longitude)

        val response = safeLocationApi.getSafeLocation(id, latitude, longitude)
        if (!response.isSuccessful) throw HttpException(response)

        val body = response.body()
        check(body?.success == true) {
            body?.message ?: "Chưa thể cập nhật điểm tránh trú"
        }

        val location = checkNotNull(body.data?.safeLocation) {
            "Phản hồi thiếu chi tiết điểm tránh trú"
        }
        check(location.id == id) { "Phản hồi sai mã điểm tránh trú" }
        location
    }

    private fun validateCoordinates(latitude: Double?, longitude: Double?) {
        if (latitude == null && longitude == null) return

        require(
            latitude != null && latitude in -90.0..90.0 &&
                    longitude != null && longitude in -180.0..180.0
        ) {
            "Cần cung cấp cả vĩ độ và kinh độ hợp lệ"
        }
    }

    private suspend fun <T> safeLocationResult(
        request: suspend () -> T
    ): Result<T> = try {
        Result.success(request())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }
}