package com.example.floodguard.ui.screens.sos

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.CreatedSosDto
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.repository.ResidentSosApiException
import com.example.floodguard.data.repository.ResidentSosNetworkException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex

data class ResidentSosEntryState(
    val isChecking: Boolean = false,
    val formAllowed: Boolean = false,
    val openSosId: String? = null,
    val error: String? = null
)

// Lần gọi hiện tại dừng trước createRemote().
// Không có nghĩa các lần gửi trước đó chưa tới Backend.
class ResidentSosNotPostedException(
    message: String,
    cause: Throwable? = null
) : Exception(message, cause)

// Đã gọi createRemote(), nhưng chưa xác nhận được kết quả.
class ResidentSosUncertainSubmissionException(
    message: String,
    cause: Throwable? = null
) : Exception(message, cause)

class ResidentSosSubmissionViewModel(
    private val loadActive:
    suspend () -> Result<List<RescueRequestDto>>,
    private val createRemote:
    suspend (CreateSosRequest) -> Result<CreatedSosDto>
) : ViewModel() {

    private val _state =
        MutableStateFlow(ResidentSosEntryState())

    val state = _state.asStateFlow()

    private val submitMutex = Mutex()

    init {
        checkActive()
    }

    fun checkActive() {
        val previous = _state.value

        if (
            previous.isChecking ||
            submitMutex.isLocked ||
            previous.openSosId != null
        ) {
            return
        }

        // Khi kiểm tra lại, giữ form đang mở để không làm
        // màn hình bị tháo ra rồi dựng lại.
        _state.value = previous.copy(
            isChecking = true,
            error = null
        )

        viewModelScope.launch {
            readActive().fold(
                onSuccess = { active ->
                    _state.value = if (active == null) {
                        ResidentSosEntryState(
                            formAllowed = true
                        )
                    } else {
                        ResidentSosEntryState(
                            openSosId = active.id
                        )
                    }
                },
                onFailure = { error ->
                    val allowForm =
                        !isAccessError(error) &&
                                (
                                        previous.formAllowed ||
                                                error is ResidentSosNetworkException
                                        )

                    _state.value = ResidentSosEntryState(
                        formAllowed = allowForm,
                        error = error.message
                            ?: "Chưa kiểm tra được SOS đang hoạt động."
                    )
                }
            )
        }
    }

    suspend fun submit(
        request: CreateSosRequest,
        isLocationFresh: () -> Boolean = { true }
    ): Result<CreatedSosDto> {
        if (!submitMutex.tryLock()) {
            return notPosted(
                "Đang xử lý yêu cầu SOS."
            )
        }

        try {
            val current = _state.value

            if (
                !current.formAllowed ||
                current.isChecking ||
                current.openSosId != null
            ) {
                return notPosted(
                    "Cần kiểm tra SOS đang hoạt động trước khi gửi."
                )
            }

            // Chỉ thao tác gửi do người dùng yêu cầu mới
            // đi tới bước kiểm tra trước POST này.
            val beforeCreate = readActive()
            val checkError = beforeCreate.exceptionOrNull()

            if (checkError != null) {
                if (isAccessError(checkError)) {
                    _state.value = ResidentSosEntryState(
                        error = checkError.message
                    )
                }

                return notPosted(
                    message =
                        "Lần này chưa gửi yêu cầu tạo SOS vì " +
                                "chưa kiểm tra được SOS đang hoạt động. " +
                                (
                                        checkError.message
                                            ?: "Vui lòng kiểm tra kết nối."
                                        ),
                    cause = checkError
                )
            }

            beforeCreate.getOrNull()?.let { active ->
                openExisting(checkNotNull(active.id))

                return notPosted(
                    "Bạn đã có SOS đang hoạt động. " +
                            "Đang mở yêu cầu để kiểm tra."
                )
            }

            // Giữ callback hiện có để tương thích với
            // SendSosViewModel. Chính sách GPS sẽ nối ở bước sau.
            if (!isLocationFresh()) {
                return notPosted(
                    "Vị trí GPS chưa đáp ứng điều kiện gửi. " +
                            "Vui lòng kiểm tra vị trí rồi xác nhận lại."
                )
            }

            val result = try {
                createRemote(request)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Result.failure(error)
            }

            val created = result.getOrNull()

            if (created != null && !created.id.isNullOrBlank()) {
                openExisting(created.id)
                return result
            }

            val error = result.exceptionOrNull()

            if (
                error is ResidentSosApiException &&
                error.statusCode == 409 &&
                error.code == "DUPLICATE_SOS_REQUEST"
            ) {
                val existingId = error.activeRequestId

                if (!existingId.isNullOrBlank()) {
                    openExisting(existingId)
                    return Result.failure(error)
                }

                return reconcileAfterUncertainResult(error)
            }

            // HTTP 408 vẫn có thể xảy ra khi phía máy chủ
            // chưa trả được kết quả xử lý.
            if (
                error is ResidentSosApiException &&
                error.statusCode in 400..499 &&
                error.statusCode != 408
            ) {
                if (isAccessError(error)) {
                    _state.value = ResidentSosEntryState(
                        error = error.message
                    )
                }

                return Result.failure(error)
            }

            // Mất mạng, 5xx, response không hợp lệ hoặc
            // thiếu mã SOS: chỉ đối chiếu, không tự POST lại.
            return reconcileAfterUncertainResult(error)
        } finally {
            submitMutex.unlock()
        }
    }

    private suspend fun reconcileAfterUncertainResult(
        originalError: Throwable?
    ): Result<CreatedSosDto> {
        val result = readActive()
        val active = result.getOrNull()

        if (active != null) {
            openExisting(checkNotNull(active.id))

            return Result.failure(
                ResidentSosUncertainSubmissionException(
                    "Đã tìm thấy SOS đang hoạt động. " +
                            "Mở yêu cầu để kiểm tra kết quả.",
                    originalError
                )
            )
        }

        val checkError = result.exceptionOrNull()

        if (checkError != null && isAccessError(checkError)) {
            _state.value = ResidentSosEntryState(
                error = checkError.message
            )
        }

        val message = if (checkError != null) {
            "Chưa xác nhận được kết quả gửi SOS. " +
                    "Thông tin cần được giữ lại để đối chiếu. " +
                    (
                            checkError.message
                                ?: "Vui lòng kiểm tra kết nối."
                            )
        } else {
            "Chưa xác nhận gửi thành công. " +
                    "Lần kiểm tra hiện tại chưa thấy SOS hoạt động. " +
                    "Cần giữ nguyên bản gửi để đối chiếu."
        }

        return Result.failure(
            ResidentSosUncertainSubmissionException(
                message = message,
                cause = checkError ?: originalError
            )
        )
    }

    private fun notPosted(
        message: String,
        cause: Throwable? = null
    ): Result<CreatedSosDto> =
        Result.failure(
            ResidentSosNotPostedException(message, cause)
        )

    private fun isAccessError(error: Throwable): Boolean =
        error is ResidentSosApiException &&
                error.statusCode in setOf(401, 403)

    private fun openExisting(id: String) {
        _state.value = ResidentSosEntryState(
            openSosId = id
        )
    }

    private suspend fun readActive(): Result<RescueRequestDto?> {
        return try {
            loadActive().fold(
                onSuccess = { requests ->
                    if (
                        requests.size > 1 ||
                        requests.any {
                            it.id.isNullOrBlank() ||
                                    it.state != "active"
                        }
                    ) {
                        Result.failure(
                            IllegalStateException(
                                "Dữ liệu SOS hoạt động không hợp lệ. " +
                                        "Vui lòng kiểm tra lại."
                            )
                        )
                    } else {
                        Result.success(requests.singleOrNull())
                    }
                },
                onFailure = {
                    Result.failure(it)
                }
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.failure(error)
        }
    }
}