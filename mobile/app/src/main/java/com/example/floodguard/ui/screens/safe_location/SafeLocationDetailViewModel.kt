
package com.example.floodguard.ui.screens.safe_location

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.mapper.toDomain
import com.example.floodguard.data.repository.SafeLocationRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SafeLocationDetailViewModel(
    private val repository: SafeLocationRepository
) : ViewModel() {

    private val _uiState =
        MutableStateFlow(SafeLocationDetailUiState())

    val uiState: StateFlow<SafeLocationDetailUiState> =
        _uiState.asStateFlow()

    fun loadLocation(locationId: String) {
        viewModelScope.launch {
            _uiState.value = SafeLocationDetailUiState(
                isLoading = true,
                isMockData = false
            )

            repository.getSafeLocations()
                .onSuccess { locations ->
                    val selectedLocation = locations
                        .firstOrNull { it.id == locationId }

                    if (selectedLocation == null) {
                        _uiState.value = SafeLocationDetailUiState(
                            errorMessage = "Không tìm thấy điểm tránh trú.",
                            isMockData = false
                        )
                    } else {
                        try {
                            _uiState.value = SafeLocationDetailUiState(
                                location = selectedLocation.toDomain(),
                                isMockData = false
                            )
                        } catch (e: Exception) {
                            _uiState.value = SafeLocationDetailUiState(
                                errorMessage = "Dữ liệu địa điểm không hợp lệ.",
                                isMockData = false
                            )
                        }
                    }
                }
                .onFailure { error ->
                    _uiState.value = SafeLocationDetailUiState(
                        errorMessage = error.message
                            ?: "Không thể tải thông tin điểm tránh trú.",
                        isMockData = false
                    )
                }
        }
    }
}
