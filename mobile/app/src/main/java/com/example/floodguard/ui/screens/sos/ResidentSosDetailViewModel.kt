package com.example.floodguard.ui.screens.sos

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.remote.dto.rescue.SosHistoryEventDto
import com.example.floodguard.data.repository.ResidentSosApiException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ResidentSosEventHistoryState(
    val isEnabled: Boolean = false,
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val events: List<SosHistoryEventDto> = emptyList(),
    val error: String? = null
)

class ResidentSosDetailViewModel(
    private val sosId: String,
    private val loadDetail:
    suspend (String) -> Result<RescueRequestDto>,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val loadHistory:
    (suspend (String) -> Result<List<SosHistoryEventDto>>)? = null
) : ViewModel() {
    private val _uiState = MutableStateFlow(SosStatusUiState())
    val uiState = _uiState.asStateFlow()

    private val _historyState = MutableStateFlow(
        ResidentSosEventHistoryState(
            isEnabled = loadHistory != null
        )
    )
    val historyState = _historyState.asStateFlow()

    private var historyJob: Job? = null
    private var refreshVersion = 0L

    init {
        refresh()
    }

    fun refresh() {
        if (_uiState.value.isLoading) return

        if (sosId.isBlank()) {
            _uiState.value = SosStatusUiState(
                error = "Mã SOS không hợp lệ."
            )
            return
        }

        val version = ++refreshVersion
        historyJob?.cancel()
        _historyState.update {
            it.copy(isLoading = false, error = null)
        }

        _uiState.update {
            it.copy(isLoading = true, error = null)
        }

        viewModelScope.launch {
            try {
                loadDetail(sosId).fold(
                    onSuccess = { request ->
                        if (request.id != sosId) {
                            showError(
                                IllegalStateException(
                                    "Dữ liệu chi tiết không khớp mã SOS."
                                )
                            )
                        } else {
                            _uiState.value = SosStatusUiState(
                                request = request,
                                loadedAtMillis = nowMillis()
                            )
                            startHistoryLoading(version)
                        }
                    },
                    onFailure = ::showError
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                showError(error)
            } finally {
                _uiState.update {
                    it.copy(isLoading = false)
                }
            }
        }
    }

    private fun startHistoryLoading(version: Long) {
        val loader = loadHistory ?: return

        _historyState.update {
            it.copy(isLoading = true, error = null)
        }

        historyJob = viewModelScope.launch {
            try {
                val result = loader(sosId)

                if (version != refreshVersion) return@launch

                result.fold(
                    onSuccess = { events ->
                        _historyState.value = ResidentSosEventHistoryState(
                            isEnabled = true,
                            hasLoaded = true,
                            events = events
                        )
                    },
                    onFailure = ::showHistoryError
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (version == refreshVersion) {
                    showHistoryError(error)
                }
            }
        }
    }

    private fun showHistoryError(error: Throwable) {
        if (mustClearDetails(error)) {
            showError(error)
        } else {
            _historyState.update {
                it.copy(
                    isLoading = false,
                    error = error.message
                        ?: "Không thể tải lịch sử sự kiện SOS."
                )
            }
        }
    }

    private fun mustClearDetails(error: Throwable): Boolean =
        error is ResidentSosApiException &&
                error.statusCode in setOf(401, 403, 404)

    private fun showError(error: Throwable) {
        val message = error.message
            ?: "Không thể tải chi tiết SOS. Vui lòng thử lại."

        if (mustClearDetails(error)) {
            historyJob?.cancel()
            _historyState.value = ResidentSosEventHistoryState(
                isEnabled = loadHistory != null
            )
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
}