package com.example.floodguard.ui.screens.sos

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.CreatedSosDto
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.repository.ResidentSosApiException
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

class ResidentSosSubmissionViewModel(
    private val loadActive:
    suspend () -> Result<List<RescueRequestDto>>,
    private val createRemote:
    suspend (CreateSosRequest) -> Result<CreatedSosDto>
) : ViewModel() {
    private val _state = MutableStateFlow(ResidentSosEntryState())
    val state = _state.asStateFlow()

    private val submitMutex = Mutex()

    init {
        checkActive()
    }

    fun checkActive() {
        if (
            _state.value.isChecking ||
            submitMutex.isLocked ||
            _state.value.openSosId != null
        ) {
            return
        }

        _state.value = ResidentSosEntryState(isChecking = true)

        viewModelScope.launch {
            readActive().fold(
                onSuccess = { active ->
                    _state.value = if (active == null) {
                        ResidentSosEntryState(formAllowed = true)
                    } else {
                        ResidentSosEntryState(openSosId = active.id)
                    }
                },
                onFailure = { error ->
                    _state.value = ResidentSosEntryState(
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
            return Result.failure(
                IllegalStateException("Đang xử lý yêu cầu SOS.")
            )
        }

        try {
            if (
                !_state.value.formAllowed ||
                _state.value.isChecking ||
                _state.value.openSosId != null
            ) {
                return Result.failure(
                    IllegalStateException(
                        "Cần kiểm tra SOS đang hoạt động trước khi gửi."
                    )
                )
            }

            // Kiểm tra lại ngay trước mỗi lần POST do người dùng yêu cầu.
            val beforeCreate = readActive()
            val checkError = beforeCreate.exceptionOrNull()

            if (checkError != null) {
                return Result.failure(checkError)
            }

            beforeCreate.getOrNull()?.let { active ->
                openExisting(active.id!!)
                return Result.failure(
                    IllegalStateException(
                        "Bạn đã có SOS đang hoạt động. Đang mở yêu cầu."
                    )
                )
            }

            // GET kiểm tra SOS có thể kéo dài.
// Kiểm tra lại mẫu GPS ngay trước khi bắt đầu POST.
            if (!isLocationFresh()) {
                return Result.failure(
                    IllegalStateException(
                        "Vị trí GPS đã quá 30 giây hoặc không hợp lệ. " +
                                "Vui lòng cập nhật GPS rồi xác nhận gửi lại."
                    )
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
                _state.value = ResidentSosEntryState(
                    openSosId = created.id
                )
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

                return reconcileAfterUncertainResult()
            }

            // Lỗi 4xx đã có kết quả rõ ràng, giữ form và báo lỗi.
            if (
                error is ResidentSosApiException &&
                error.statusCode in 400..499
            ) {
                return Result.failure(error)
            }

            // Mất mạng, 5xx hoặc response không hợp lệ:
            // không biết chắc Backend đã lưu hay chưa.
            return reconcileAfterUncertainResult()
        } finally {
            submitMutex.unlock()
        }
    }

    private suspend fun reconcileAfterUncertainResult():
            Result<CreatedSosDto> {
        val result = readActive()
        val active = result.getOrNull()

        if (active != null) {
            openExisting(active.id!!)
            return Result.failure(
                IllegalStateException(
                    "Đã tìm thấy SOS đang hoạt động. " +
                            "Mở yêu cầu để kiểm tra kết quả."
                )
            )
        }

        val error = result.exceptionOrNull()

        return if (error != null) {
            Result.failure(
                IllegalStateException(
                    "Chưa xác nhận được kết quả gửi SOS. " +
                            "Không tự gửi lại. " +
                            (error.message ?: "Vui lòng kiểm tra kết nối."),
                    error
                )
            )
        } else {
            Result.failure(
                IllegalStateException(
                    "Chưa xác nhận gửi thành công. " +
                            "Lần kiểm tra hiện tại chưa thấy SOS hoạt động. " +
                            "Thông tin form được giữ nguyên; " +
                            "hãy kiểm tra lại trước khi chủ động gửi lại."
                )
            )
        }
    }

    private fun openExisting(id: String) {
        _state.value = ResidentSosEntryState(openSosId = id)
    }

    private suspend fun readActive(): Result<RescueRequestDto?> {
        return try {
            loadActive().fold(
                onSuccess = { requests ->
                    if (
                        requests.size > 1 ||
                        requests.any {
                            it.id.isNullOrBlank() || it.state != "active"
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
                onFailure = { Result.failure(it) }
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.failure(error)
        }
    }
}