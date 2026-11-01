
package com.example.floodguard.data.repository

import com.example.floodguard.data.remote.api.RescueRequestApi
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.CreatedSosDto
import com.google.gson.JsonParseException
import com.google.gson.stream.MalformedJsonException
import java.io.EOFException
import java.io.IOException
import kotlinx.coroutines.CancellationException

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


                if (
                    response.code() == 201 &&
                    body?.success == true &&
                    !createdSos?.id.isNullOrBlank()
                ) {
                    Result.success(createdSos!!)
                } else {
                    invalidCreateSosResponse()
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

        } catch (e: CancellationException) {
            throw e
        } catch (e: EOFException) {
            // Response body rỗng hoặc JSON bị kết thúc đột ngột.
            invalidCreateSosResponse(e)
        } catch (e: JsonParseException) {
            // Không thể parse JSON response.
            invalidCreateSosResponse(e)
        } catch (e: MalformedJsonException) {
            // JSON response sai định dạng.
            invalidCreateSosResponse(e)
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

    private fun invalidCreateSosResponse(
        cause: Throwable? = null
    ): Result<CreatedSosDto> = Result.failure(
        IllegalStateException(
            "Máy chủ trả về dữ liệu SOS không hợp lệ. " +
                    "Yêu cầu có thể đã được ghi nhận, " +
                    "hãy kiểm tra trạng thái trước khi thử lại.",
            cause
        )
    )
}
