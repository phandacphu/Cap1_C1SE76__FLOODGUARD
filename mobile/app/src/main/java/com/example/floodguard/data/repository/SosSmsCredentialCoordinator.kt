package com.example.floodguard.data.repository

import android.os.SystemClock
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SosSmsSessionKey
import com.example.floodguard.data.remote.dto.rescue.SosSmsCredential
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex

// Chỉ chứa thông tin an toàn để hiển thị.
// Không chứa credential, JWT hoặc nội dung SMS.
data class SosSmsCredentialState(
    val isPreparing: Boolean = false,
    val ready: Boolean = false,
    val recipientPhone: String? = null,
    val expiresAt: String? = null,
    val message: String =
        "Tự tiếp nhận SMS chưa sẵn sàng: " +
                "chưa có mã hoặc mã đã hết hạn."
)

class SosSmsCredentialCoordinator(
    private val sessionManager: SessionManager,
    private val repository: ResidentSosRepository,
    private val sessionKey: SosSmsSessionKey,
    private val nowMillis: () -> Long =
        System::currentTimeMillis,
    private val elapsedMillis: () -> Long =
        SystemClock::elapsedRealtime
) {
    private val mutex = Mutex()

    private var lastAttemptElapsed: Long? = null
    private var lastFailure: String? = null
    private var authorizationRejected = false

    private val _state =
        MutableStateFlow(SosSmsCredentialState())

    val state = _state.asStateFlow()

    suspend fun refresh(hasInternet: Boolean) {
        if (!mutex.tryLock()) return

        try {
            if (!isCurrentSession()) {
                _state.value = SosSmsCredentialState(
                    message = "Tài khoản đã thay đổi. " +
                            "Hãy mở lại chức năng SOS."
                )
                return
            }

            val cached =
                sessionManager.getSosSmsCredential(sessionKey)

            publish(cached)

            if (
                authorizationRejected ||
                !hasInternet ||
                cached?.needsRefresh(nowMillis()) == false
            ) {
                return
            }

            val elapsed = elapsedMillis()

            val attemptedRecently =
                lastAttemptElapsed?.let {
                    elapsed - it < RETRY_INTERVAL_MILLIS
                } == true

            if (attemptedRecently) return

            lastAttemptElapsed = elapsed

            _state.value = _state.value.copy(
                isPreparing = true
            )

            val result = repository.smsCredential()

            // Request có thể hoàn tất sau khi người dùng đổi tài khoản.
            if (!isCurrentSession()) {
                _state.value = SosSmsCredentialState(
                    message = "Tài khoản đã thay đổi. " +
                            "Hãy mở lại chức năng SOS."
                )
                return
            }

            val credential = result.getOrNull()

            if (credential?.usableAt(nowMillis()) == true) {
                val saved =
                    sessionManager.saveSosSmsCredential(
                        sessionKey,
                        credential
                    )

                if (saved) {
                    lastFailure = null
                    publish(credential)
                } else {
                    _state.value = SosSmsCredentialState(
                        message = "Phiên đăng nhập đã thay đổi. " +
                                "Hãy mở lại SOS."
                    )
                }

                return
            }

            val error = result.exceptionOrNull()

            if (
                error is ResidentSosApiException &&
                error.statusCode in setOf(401, 403)
            ) {
                authorizationRejected = true

                lastFailure = if (error.statusCode == 401) {
                    "Phiên đăng nhập không hợp lệ. " +
                            "Vui lòng đăng nhập lại."
                } else {
                    "Tài khoản hiện không được phép " +
                            "chuẩn bị mã SMS SOS."
                }

                sessionManager.clearSosSmsCredential(
                    sessionKey
                )

                publish(null)
            } else {
                lastFailure =
                    "Chưa làm mới được mã SMS. " +
                            "Kiểm tra kết nối hoặc thử lại sau."

                publish(cached)
            }
        } catch (error: CancellationException) {
            lastAttemptElapsed = null
            throw error
        } catch (_: Exception) {
            _state.value = SosSmsCredentialState(
                message = "Chưa đọc hoặc lưu được mã SMS SOS " +
                        "trên máy. Hãy thử lại sau."
            )
        } finally {
            _state.value = _state.value.copy(
                isPreparing = false
            )

            mutex.unlock()
        }
    }

    private suspend fun isCurrentSession(): Boolean =
        sessionManager.getSosSmsSessionKey() == sessionKey

    private fun publish(credential: SosSmsCredential?) {
        val ready =
            !authorizationRejected &&
                    credential?.usableAt(nowMillis()) == true

        val baseMessage = if (ready) {
            "Đã chuẩn bị mã SMS SOS. Khi cần, bạn vẫn phải " +
                    "tự bấm Gửi trong ứng dụng SMS."
        } else {
            "Tự tiếp nhận SMS chưa sẵn sàng: " +
                    "chưa có mã hoặc mã đã hết hạn."
        }

        _state.value = SosSmsCredentialState(
            ready = ready,
            recipientPhone =
                credential?.recipientPhone?.takeIf { ready },
            expiresAt =
                credential?.expiresAt?.takeIf { ready },
            message = if (lastFailure == null) {
                baseMessage
            } else {
                "$baseMessage ${lastFailure.orEmpty()}"
            }
        )
    }

    private companion object {
        const val RETRY_INTERVAL_MILLIS =
            15 * 60 * 1000L
    }
}