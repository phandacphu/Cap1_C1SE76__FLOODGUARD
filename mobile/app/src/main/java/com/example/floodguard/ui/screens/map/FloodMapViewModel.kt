package com.example.floodguard.ui.screens.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.FloodAreaRepository
import com.example.floodguard.data.repository.FloodAlertRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class FloodMapViewModel(
    private val floodAreaRepository: FloodAreaRepository,
    private val floodAlertRepository: FloodAlertRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        FloodMapUiState()
    )

    val uiState: StateFlow<FloodMapUiState> =
        _uiState.asStateFlow()

    init {
        loadFloodAreas()
        loadFloodAlerts()
    }

    private fun loadFloodAreas() {

        viewModelScope.launch {

            _uiState.value =
                _uiState.value.copy(
                    isLoadingFloodAreas = true,
                    floodAreasError = null
                )

            val result =
                floodAreaRepository.getFloodAreas()

            result
                .onSuccess { floodAreas ->

                    _uiState.value =
                        _uiState.value.copy(
                            floodAreas = floodAreas,
                            isLoadingFloodAreas = false,
                            floodAreasError = null
                        )
                }
                .onFailure { error ->

                    _uiState.value =
                        _uiState.value.copy(
                            isLoadingFloodAreas = false,
                            floodAreasError =
                                error.message
                                    ?: "Không thể tải dữ liệu vùng ngập"
                        )
                }
        }
    }

    private fun loadFloodAlerts() {

        viewModelScope.launch {

            _uiState.value =
                _uiState.value.copy(
                    isLoadingFloodAlerts = true,
                    floodAlertsError = null
                )

            val result =
                floodAlertRepository.getFloodAlerts()

            result
                .onSuccess { floodAlerts ->

                    _uiState.value =
                        _uiState.value.copy(
                            floodAlerts = floodAlerts,
                            isLoadingFloodAlerts = false,
                            floodAlertsError = null
                        )
                }
                .onFailure { error ->

                    _uiState.value =
                        _uiState.value.copy(
                            isLoadingFloodAlerts = false,
                            floodAlertsError =
                                error.message
                                    ?: "Không thể tải dữ liệu cảnh báo"
                        )
                }
        }
    }

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
    fun selectFloodAlert(
        alertId: String?
    ) {
        _uiState.value =
            _uiState.value.copy(
                selectedFloodAlertId = alertId
            )
    }
}