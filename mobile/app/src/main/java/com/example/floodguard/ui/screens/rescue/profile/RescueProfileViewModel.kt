package com.example.floodguard.ui.screens.rescue.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.remote.api.RescueProfileDto
import com.example.floodguard.data.repository.RescueProfileApiException
import com.example.floodguard.data.repository.RescueProfileRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RescueProfileUiState(
    val isLoading: Boolean = false,
    val profile: RescueProfileDto? = null,
    val error: String? = null,
    val sessionExpired: Boolean = false
)

class RescueProfileViewModel(
    private val loadProfile: suspend () -> Result<RescueProfileDto>
) : ViewModel() {

    constructor(repository: RescueProfileRepository) : this(
        loadProfile = repository::getProfile
    )

    private val _state = MutableStateFlow(RescueProfileUiState())
    val state = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        if (_state.value.isLoading) return

        _state.value = RescueProfileUiState(
            isLoading = true
        )

        viewModelScope.launch {
            try {
                loadProfile().fold(
                    onSuccess = { profile ->
                        _state.value = RescueProfileUiState(
                            profile = profile
                        )
                    },
                    onFailure = { error ->
                        showError(error)
                    }
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    private fun showError(error: Throwable) {
        _state.value = RescueProfileUiState(
            error = error.message
                ?: "Không thể tải thông tin hồ sơ.",
            sessionExpired = error is RescueProfileApiException &&
                    error.statusCode == 401
        )
    }
}