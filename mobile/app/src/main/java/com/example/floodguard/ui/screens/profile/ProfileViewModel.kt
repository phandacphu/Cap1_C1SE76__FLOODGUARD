
package com.example.floodguard.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.repository.RescueRequestRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ProfileSosUiState(
    val isLoading: Boolean = false,
    val requests: List<RescueRequestDto> = emptyList(),
    val error: String? = null
)

class ProfileViewModel(
    private val repository: RescueRequestRepository
) : ViewModel() {

    private val _sosState = MutableStateFlow(ProfileSosUiState())

    val sosState: StateFlow<ProfileSosUiState> =
        _sosState.asStateFlow()

    init {
        loadSosHistory()
    }

    fun loadSosHistory() {
        viewModelScope.launch {
            _sosState.value = ProfileSosUiState(
                isLoading = true
            )

            val result = repository.getRescueRequests()

            _sosState.value = result.fold(
                onSuccess = { requests ->
                    ProfileSosUiState(
                        requests = requests
                    )
                },
                onFailure = { error ->
                    ProfileSosUiState(
                        error = error.message
                            ?: "Không thể tải lịch sử SOS."
                    )
                }
            )
        }
    }
}
