package com.example.floodguard.data.repository

import com.example.floodguard.core.datastore.UserPreferences
import com.example.floodguard.data.remote.api.AuthApi
import com.example.floodguard.data.remote.dto.auth.LoginRequest
import com.example.floodguard.data.remote.dto.auth.RegisterRequest
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class AuthRepository(
    private val authApi: AuthApi,
    private val userPreferences: UserPreferences
) {

    suspend fun login(
        identifier: String,
        password: String
    ): Result<Unit> {

        return try {

            val response = authApi.login(
                LoginRequest(
                    identifier = identifier,
                    password = password
                )
            )

            if (response.isSuccessful) {

                val body = response.body()

                if (body == null) {
                    return Result.failure(
                        Exception("Phản hồi từ máy chủ không hợp lệ.")
                    )
                }

                if (!body.success) {
                    return Result.failure(
                        Exception(
                            body.message ?: "Đăng nhập thất bại."
                        )
                    )
                }

                val token = body.data?.token

                if (token.isNullOrBlank()) {
                    return Result.failure(
                        Exception(
                            body.message ?: "Không nhận được token từ máy chủ."
                        )
                    )
                }

                userPreferences.saveToken(token)

                Result.success(Unit)

            } else {

                val message =
                    when (response.code()) {

                        400 ->
                            "Thông tin đăng nhập không hợp lệ."

                        401 ->
                            "Email/số điện thoại hoặc mật khẩu không đúng."

                        403 ->
                            "Tài khoản không có quyền truy cập."

                        404 ->
                            "Không tìm thấy tài khoản."

                        408 ->
                            "Yêu cầu tới máy chủ quá thời gian."

                        500 ->
                            "Máy chủ đang gặp sự cố."

                        502 ->
                            "Máy chủ trung gian đang gặp sự cố."

                        503 ->
                            "Dịch vụ hiện không khả dụng."

                        else ->
                            "Đăng nhập thất bại (${response.code()})."
                    }

                Result.failure(
                    Exception(message)
                )
            }

        } catch (e: UnknownHostException) {

            Result.failure(
                Exception("Không thể kết nối tới máy chủ.")
            )

        } catch (e: SocketTimeoutException) {

            Result.failure(
                Exception("Kết nối tới máy chủ quá lâu.")
            )

        } catch (e: IOException) {

            Result.failure(
                Exception("Không có kết nối mạng.")
            )

        } catch (e: Exception) {

            Result.failure(
                Exception(
                    e.message ?: "Đã xảy ra lỗi khi đăng nhập."
                )
            )
        }
    }

    suspend fun register(
        fullName: String,
        phone: String,
        email: String,
        password: String
    ): Result<Unit> {

        return try {

            val response = authApi.register(
                RegisterRequest(
                    fullName = fullName,
                    phone = phone,
                    email = email,
                    password = password
                )
            )

            if (response.isSuccessful) {

                val body = response.body()

                if (body == null) {
                    return Result.failure(
                        Exception("Phản hồi từ máy chủ không hợp lệ.")
                    )
                }

                if (!body.success) {
                    return Result.failure(
                        Exception(
                            body.message ?: "Đăng ký thất bại."
                        )
                    )
                }

                Result.success(Unit)

            } else {

                val message =
                    when (response.code()) {

                        400 ->
                            "Thông tin đăng ký không hợp lệ."

                        409 ->
                            "Email hoặc số điện thoại đã tồn tại."

                        500 ->
                            "Máy chủ đang gặp sự cố."

                        502 ->
                            "Máy chủ trung gian đang gặp sự cố."

                        503 ->
                            "Dịch vụ hiện không khả dụng."

                        else ->
                            "Đăng ký thất bại (${response.code()})."
                    }

                Result.failure(
                    Exception(message)
                )
            }

        } catch (e: UnknownHostException) {

            Result.failure(
                Exception("Không thể kết nối tới máy chủ.")
            )

        } catch (e: SocketTimeoutException) {

            Result.failure(
                Exception("Kết nối tới máy chủ quá lâu.")
            )

        } catch (e: IOException) {

            Result.failure(
                Exception("Không có kết nối mạng.")
            )

        } catch (e: Exception) {

            Result.failure(
                Exception(
                    e.message ?: "Đã xảy ra lỗi khi đăng ký."
                )
            )
        }
    }
}