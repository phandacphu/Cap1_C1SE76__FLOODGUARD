package com.example.floodguard.ui.screens.safe_location

import androidx.lifecycle.ViewModel
import com.example.floodguard.domain.model.SafeLocation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class SafeLocationDetailViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(
        SafeLocationDetailUiState()
    )

    val uiState: StateFlow<SafeLocationDetailUiState> =
        _uiState.asStateFlow()

    fun loadLocation(
        locationId: String,
        locations: List<SafeLocation>
    ) {
        _uiState.value = SafeLocationDetailUiState(
            isLoading = true
        )

        val selectedLocation = locations.find {
            it.id == locationId
        }

        _uiState.value = if (selectedLocation != null) {
            SafeLocationDetailUiState(
                location = selectedLocation,
                isMockData = true
            )
        } else {
            SafeLocationDetailUiState(
                errorMessage = "Không tìm thấy địa điểm tránh trú."
            )
        }
    }
}