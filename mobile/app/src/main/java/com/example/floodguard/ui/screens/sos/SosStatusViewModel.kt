package com.example.floodguard.ui.screens.sos

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.repository.RescueRequestRepository
import com.example.floodguard.data.repository.SosHistoryHttpException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SosStatusUiState(
    val isLoading: Boolean = false,
    val request: RescueRequestDto? = null,
    val error: String? = null,
    val loadedAtMillis: Long? = null
)

class SosStatusViewModel(
    private val repository: RescueRequestRepository,
    private val sosId: String,
    private val nowMillis: () -> Long = System::currentTimeMillis
) : ViewModel() {

    private val _uiState = MutableStateFlow(SosStatusUiState())
    val uiState = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        if (_uiState.value.isLoading) return

        if (sosId.isBlank()) {
            _uiState.update {
                it.copy(error = "Mã yêu cầu SOS không hợp lệ.")
            }
            return
        }

        _uiState.update {
            it.copy(isLoading = true, error = null)
        }

        viewModelScope.launch {
            try {
                repository.getRescueRequests().fold(
                    onSuccess = { requests ->
                        val matches = requests.filter { it.id == sosId }

                        when (matches.size) {
                            1 -> _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    request = matches.single(),
                                    error = null,
                                    loadedAtMillis = nowMillis()
                                )
                            }

                            0 -> _uiState.value = SosStatusUiState(
                                error = "Không tìm thấy yêu cầu SOS " +
                                        "trong danh sách được phép truy cập."
                            )

                            else -> _uiState.value = SosStatusUiState(
                                error = "Dữ liệu có mã SOS trùng lặp. " +
                                        "Không thể xác định yêu cầu."
                            )
                        }
                    },
                    onFailure = { error ->
                        val message = error.message
                            ?: "Không thể tải trạng thái SOS."

                        val accessDenied = error is SosHistoryHttpException &&
                                error.statusCode in setOf(401, 403)

                        if (accessDenied) {
                            _uiState.value = SosStatusUiState(error = message)
                        } else {
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    error = message
                                )
                            }
                        }
                    }
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = "Không thể tải trạng thái SOS. Vui lòng thử lại."
                    )
                }
            } finally {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }
}