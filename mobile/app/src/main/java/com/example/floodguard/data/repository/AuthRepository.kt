
package com.example.floodguard.data.repository

import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.remote.api.AuthApi
import com.example.floodguard.data.remote.dto.auth.LoginRequest
import com.example.floodguard.data.remote.dto.auth.RegisterRequest
import com.example.floodguard.core.notifications.NotificationDeviceRuntime
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first

class AuthRepository(
    private val authApi: AuthApi,
    private val sessionManager: SessionManager,
    private val notificationDeviceRuntime: NotificationDeviceRuntime? = null
) {

    suspend fun login(
        identifier: String,
        password: String
    ): Result<Unit> {

        return try {

            val requestGeneration = sessionManager.getGeneration()

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
                            body.message
                                ?: "Không nhận được token từ máy chủ."
                        )
                    )
                }

                // Lấy thông tin người dùng từ API đăng nhập
                val user = body.data?.user

                val saved = sessionManager.saveAuthenticatedSession(
                    token = token,
                    user = SessionUser(
                        id = user?.id,
                        fullName = user?.fullName,
                        email = user?.email,
                        phone = user?.phone,
                        role = user?.role
                    ),
                    expectedGeneration = requestGeneration
                )

                if (!saved) {
                    return Result.failure(
                        Exception(
                            "Phiên đăng nhập đã thay đổi. Vui lòng thử lại."
                        )
                    )
                }

                Result.success(Unit)

            } else {

                val message = when (response.code()) {
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

                Result.failure(Exception(message))
            }

        } catch (error: CancellationException) {
            throw error

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

                val message = when (response.code()) {

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

                Result.failure(Exception(message))
            }

        } catch (error: CancellationException) {
            throw error

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

    suspend fun logout(): Result<Unit> {
        return try {
            val generation = sessionManager.getGeneration()
            val snapshot = sessionManager.authenticatedSessionFlow.first()

            if (
                snapshot != null &&
                snapshot.generation != generation
            ) {
                return Result.failure(
                    Exception("Phiên hiện tại đã thay đổi.")
                )
            }

            if (
                snapshot != null &&
                snapshot.user.role == "resident" &&
                notificationDeviceRuntime != null
            ) {
                return notificationDeviceRuntime.logout(snapshot)
            }

            val cleared = sessionManager.clearSession(
                expectedGeneration = generation
            )

            if (cleared) {
                Result.success(Unit)
            } else {
                Result.failure(
                    Exception("Phiên hiện tại đã thay đổi.")
                )
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            Result.failure(
                Exception("Không thể đăng xuất.")
            )
        }
    }
}
