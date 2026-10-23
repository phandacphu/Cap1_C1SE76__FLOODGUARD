
package com.example.floodguard.data.repository

import com.example.floodguard.data.model.SafeLocationDto
import com.example.floodguard.data.model.SafeLocationsResponse
import com.example.floodguard.data.remote.api.SafeLocationApi
import kotlinx.coroutines.CancellationException
import retrofit2.Response
import java.io.IOException

class SafeLocationRepository(
    private val safeLocationApi: SafeLocationApi
) {

    suspend fun getSafeLocations(): Result<List<SafeLocationDto>> {
        return try {
            parseResponse(
                safeLocationApi.getSafeLocations()
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            Result.failure(
                IOException(
                    "Không thể kết nối máy chủ. Vui lòng kiểm tra Internet và thử lại.",
                    e
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getNearbySafeLocations(
        latitude: Double,
        longitude: Double,
        radiusKm: Double = 10.0,
        type: String? = null
    ): Result<List<SafeLocationDto>> {
        return try {
            require(latitude.isFinite() && latitude in -90.0..90.0) {
                "Vĩ độ không hợp lệ"
            }

            require(longitude.isFinite() && longitude in -180.0..180.0) {
                "Kinh độ không hợp lệ"
            }

            require(radiusKm.isFinite() && radiusKm > 0.0 && radiusKm <= 100.0) {
                "Bán kính phải lớn hơn 0 và không quá 100 km"
            }

            parseResponse(
                safeLocationApi.getNearbySafeLocations(
                    latitude = latitude,
                    longitude = longitude,
                    radiusKm = radiusKm,
                    type = type
                )
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            Result.failure(
                IOException(
                    "Không thể kết nối máy chủ. Vui lòng kiểm tra Internet và thử lại.",
                    e
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseResponse(
        response: Response<SafeLocationsResponse>
    ): Result<List<SafeLocationDto>> {

        if (!response.isSuccessful) {
            return Result.failure(
                Exception(
                    "Không thể tải điểm tránh trú (HTTP ${response.code()})"
                )
            )
        }

        val body = response.body()

        if (body?.success != true) {
            return Result.failure(
                Exception(
                    body?.message ?: "Không thể lấy danh sách điểm tránh trú"
                )
            )
        }

        val locations = body.data?.safeLocations
            ?: return Result.failure(
                Exception("Dữ liệu điểm tránh trú không hợp lệ")
            )

        return Result.success(locations)
    }
}
