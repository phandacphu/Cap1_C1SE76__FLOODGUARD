package com.example.floodguard.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.repository.RescueRequestRepository
import com.example.floodguard.data.repository.ResidentSosApiException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProfileSosUiState(
    val isLoading: Boolean = false,
    val requests: List<RescueRequestDto> = emptyList(),
    val error: String? = null
)

class ProfileViewModel(
    private val loadRequests:
    suspend () -> Result<List<RescueRequestDto>>
) : ViewModel() {

    // Giữ tương thích với các nơi gọi/test cũ.
    constructor(repository: RescueRequestRepository) :
            this(loadRequests = repository::getRescueRequests)

    private val _sosState = MutableStateFlow(ProfileSosUiState())
    val sosState = _sosState.asStateFlow()

    init {
        loadSosHistory()
    }

    fun loadSosHistory() {
        if (_sosState.value.isLoading) return

        _sosState.update {
            it.copy(isLoading = true, error = null)
        }

        viewModelScope.launch {
            try {
                loadRequests().fold(
                    onSuccess = { requests ->
                        _sosState.value = ProfileSosUiState(
                            requests = requests
                        )
                    },
                    onFailure = ::showError
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                showError(error)
            } finally {
                _sosState.update {
                    it.copy(isLoading = false)
                }
            }
        }
    }

    private fun showError(error: Throwable) {
        val message = error.message
            ?: "Không thể tải lịch sử SOS."

        val accessDenied = error is ResidentSosApiException &&
                error.statusCode in setOf(401, 403)

        if (accessDenied) {
            _sosState.value = ProfileSosUiState(error = message)
        } else {
            _sosState.update {
                it.copy(
                    isLoading = false,
                    error = message
                )
            }
        }
    }
}