
package com.example.floodguard.data.repository

import com.example.floodguard.data.remote.api.RescueRequestApi
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.CreatedSosDto
import java.io.IOException

class RescueRequestRepository(
    private val api: RescueRequestApi
) {

    suspend fun getRescueRequests(): Result<List<RescueRequestDto>> {
        return try {
            val response = api.getRescueRequests()

            if (response.isSuccessful) {
                val body = response.body()

                if (body?.success == true) {
                    Result.success(
                        body.data?.rescueRequests ?: emptyList()
                    )
                } else {
                    Result.failure(
                        Exception(
                            body?.message ?: "Không thể tải lịch sử SOS."
                        )
                    )
                }
            } else {
                val message = when (response.code()) {
                    401 -> "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."
                    403 -> "Tài khoản không có quyền xem dữ liệu này."
                    500 -> "Máy chủ đang gặp sự cố."
                    else -> "Không thể tải lịch sử SOS (${response.code()})."
                }

                Result.failure(Exception(message))
            }

        } catch (e: Exception) {
            Result.failure(
                Exception(e.message ?: "Không thể kết nối máy chủ.")
            )
        }
    }

    suspend fun createSos(
        request: CreateSosRequest
    ): Result<CreatedSosDto> {
        return try {
            val response = api.createSos(request)

            if (response.isSuccessful) {
                val body = response.body()
                val createdSos = body?.data?.rescueRequest

                if (body?.success == true && createdSos != null) {
                    Result.success(createdSos)
                } else {
                    Result.failure(
                        Exception("Máy chủ trả về dữ liệu SOS không hợp lệ.")
                    )
                }
            } else {
                val message = when (response.code()) {
                    400 -> "Thông tin SOS không hợp lệ. Vui lòng kiểm tra lại."
                    401 -> "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại."
                    403 -> "Tài khoản không có quyền gửi SOS."
                    409 -> "Bạn đã có yêu cầu SOS đang được xử lý."
                    500 -> "Máy chủ đang gặp sự cố. Vui lòng thử lại sau."
                    else -> "Không thể gửi SOS (HTTP ${response.code()})."
                }

                Result.failure(Exception(message))
            }
        } catch (e: IOException) {
            Result.failure(
                Exception(
                    "Không thể kết nối máy chủ. " +
                            "Nếu vừa gửi SOS, hãy kiểm tra trạng thái trước khi thử lại.",
                    e
                )
            )
        } catch (e: Exception) {
            Result.failure(
                Exception(e.message ?: "Không thể xử lý yêu cầu SOS.", e)
            )
        }
    }
}
