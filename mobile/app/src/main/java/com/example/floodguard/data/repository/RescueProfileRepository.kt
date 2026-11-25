package com.example.floodguard.data.repository

import com.example.floodguard.data.remote.api.RescueProfileApi
import com.example.floodguard.data.remote.api.RescueProfileDto
import kotlinx.coroutines.CancellationException
import java.io.IOException

class RescueProfileApiException(
    val statusCode: Int,
    message: String
) : Exception(message)

class RescueProfileRepository(
    private val api: RescueProfileApi
) {

    suspend fun getProfile(): Result<RescueProfileDto> {
        return try {
            val response = api.getProfile()

            if (!response.isSuccessful) {
                return Result.failure(
                    errorForStatus(response.code())
                )
            }

            val body = response.body()
            val user = body?.data?.user

            if (
                body?.success != true ||
                user == null ||
                user.id.isNullOrBlank()
            ) {
                return Result.failure(
                    RescueProfileApiException(
                        -1,
                        "Phản hồi hồ sơ từ máy chủ không hợp lệ."
                    )
                )
            }

            if (user.role != "rescue") {
                return Result.failure(
                    RescueProfileApiException(
                        403,
                        "Tài khoản không có quyền xem hồ sơ cứu hộ."
                    )
                )
            }

            if (user.isActive == false) {
                return Result.failure(
                    RescueProfileApiException(
                        403,
                        "Tài khoản đã bị vô hiệu hóa."
                    )
                )
            }

            Result.success(user)
        } catch (error: CancellationException) {
            throw error
        } catch (error: IOException) {
            Result.failure(
                RescueProfileApiException(
                    0,
                    "Không thể kết nối máy chủ. Kiểm tra mạng và thử lại."
                )
            )
        } catch (error: Exception) {
            Result.failure(
                RescueProfileApiException(
                    -1,
                    "Không thể tải hồ sơ. Vui lòng thử lại."
                )
            )
        }
    }

    private fun errorForStatus(
        statusCode: Int
    ): RescueProfileApiException {
        val message = when (statusCode) {
            401 -> "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
            403 -> "Tài khoản không được phép truy cập."
            404 -> "Không tìm thấy thông tin tài khoản."
            else -> "Máy chủ chưa tải được hồ sơ. Vui lòng thử lại."
        }

        return RescueProfileApiException(
            statusCode = statusCode,
            message = message
        )
    }
}