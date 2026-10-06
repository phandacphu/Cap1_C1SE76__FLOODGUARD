package com.example.floodguard.ui.screens.map

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class FloodMapViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(
        FloodMapUiState()
    )

    val uiState: StateFlow<FloodMapUiState> =
        _uiState.asStateFlow()

    fun toggleFloodLayer() {
        _uiState.value =
            _uiState.value.copy(
                isFloodLayerEnabled =
                    !_uiState.value.isFloodLayerEnabled
            )
    }

    fun toggleUserLayer() {
        _uiState.value =
            _uiState.value.copy(
                isUserLayerEnabled =
                    !_uiState.value.isUserLayerEnabled
            )
    }

    fun toggleShelterLayer() {
        _uiState.value =
            _uiState.value.copy(
                isShelterLayerEnabled =
                    !_uiState.value.isShelterLayerEnabled
            )
    }

    fun toggleSafeRouteLayer() {
        _uiState.value =
            _uiState.value.copy(
                isSafeRouteLayerEnabled =
                    !_uiState.value.isSafeRouteLayerEnabled
            )
    }
}