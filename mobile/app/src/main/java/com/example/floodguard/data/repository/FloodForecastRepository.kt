package com.example.floodguard.data.repository

import com.example.floodguard.data.model.FloodForecastData
import com.example.floodguard.data.remote.api.FloodForecastApi
import kotlinx.coroutines.CancellationException
import java.io.IOException
import java.net.SocketTimeoutException

class FloodForecastRepository(
    private val forecastApi: FloodForecastApi
) {

    suspend fun getForecast(
        latitude: Double,
        longitude: Double
    ): Result<FloodForecastData> {

        if (!latitude.isFinite() || latitude !in -90.0..90.0) {
            return Result.failure(
                IllegalArgumentException("Vĩ độ không hợp lệ.")
            )
        }

        if (!longitude.isFinite() || longitude !in -180.0..180.0) {
            return Result.failure(
                IllegalArgumentException("Kinh độ không hợp lệ.")
            )
        }

        return try {
            val response = forecastApi.getForecast(
                latitude = latitude,
                longitude = longitude
            )

            if (!response.isSuccessful) {
                val message = when (response.code()) {
                    400 ->
                        "Vị trí gửi lên máy chủ không hợp lệ."

                    502 ->
                        "Dịch vụ dự báo hiện không khả dụng. " +
                                "Vui lòng thử lại sau."

                    504 ->
                        "Dịch vụ dự báo phản hồi quá thời gian chờ. " +
                                "Vui lòng thử lại."

                    else ->
                        "Không thể tải dự báo từ máy chủ. " +
                                "Vui lòng thử lại."
                }

                return Result.failure(Exception(message))
            }

            val body = response.body()
                ?: return Result.failure(
                    Exception("Máy chủ không trả về nội dung dự báo.")
                )

            if (body.success != true) {
                return Result.failure(
                    Exception(
                        body.message?.takeIf { it.isNotBlank() }
                            ?: "Không thể lấy dữ liệu dự báo."
                    )
                )
            }

            val data = body.data
                ?: return Result.failure(
                    Exception("Phản hồi thiếu dữ liệu dự báo.")
                )

            if (
                data.weather == null ||
                data.flood?.dataAvailable == null
            ) {
                return Result.failure(
                    Exception("Dữ liệu dự báo từ máy chủ chưa đầy đủ.")
                )
            }

            // dataAvailable=false vẫn là phản hồi hợp lệ.
            // Giữ nguyên dữ liệu thời tiết và các giá trị null.
            Result.success(data)

        } catch (error: CancellationException) {
            throw error

        } catch (error: SocketTimeoutException) {
            Result.failure(
                Exception(
                    "Yêu cầu dự báo đã hết thời gian chờ. " +
                            "Vui lòng thử lại.",
                    error
                )
            )

        } catch (error: IOException) {
            Result.failure(
                Exception(
                    "Không tải được dữ liệu dự báo. " +
                            "Vui lòng kiểm tra kết nối và thử lại.",
                    error
                )
            )

        } catch (error: Exception) {
            Result.failure(
                Exception(
                    "Không thể đọc dữ liệu dự báo từ máy chủ.",
                    error
                )
            )
        }
    }
}