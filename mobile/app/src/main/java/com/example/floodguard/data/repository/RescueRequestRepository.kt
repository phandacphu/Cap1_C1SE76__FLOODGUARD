
package com.example.floodguard.data.repository

import com.example.floodguard.data.remote.api.RescueRequestApi
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto

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
}
