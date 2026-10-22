package com.example.floodguard.ui.screens.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.FloodAreaRepository
import com.example.floodguard.data.repository.FloodAlertRepository
import com.example.floodguard.data.repository.SafeLocationRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class FloodMapViewModel(
    private val floodAreaRepository: FloodAreaRepository,
    private val floodAlertRepository: FloodAlertRepository,
    private val safeLocationRepository: SafeLocationRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        FloodMapUiState()
    )

    val uiState: StateFlow<FloodMapUiState> =
        _uiState.asStateFlow()

    init {
        loadFloodAreas()
        loadFloodAlerts()
        loadSafeLocations()
    }

    fun loadFloodAreas() {

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

    fun loadFloodAlerts() {

        viewModelScope.launch {

            _uiState.value =
                _uiState.value.copy(
                    isLoadingFloodAlerts = true,
                    floodAlertsError = null
                )

            val result =
                floodAlertRepository.getActiveFloodAlerts()

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


    fun loadSafeLocations() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isLoadingSafeLocations = true,
                safeLocationsError = null
            )

            safeLocationRepository.getSafeLocations()
                .onSuccess { locations ->
                    val validLocations = locations.filter { location ->
                        location.location.latitude.isFinite() &&
                                location.location.longitude.isFinite() &&
                                location.location.latitude in -90.0..90.0 &&
                                location.location.longitude in -180.0..180.0
                    }

                    _uiState.value = _uiState.value.copy(
                        safeLocations = validLocations,
                        isLoadingSafeLocations = false,
                        safeLocationsError = null
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        safeLocations = emptyList(),
                        isLoadingSafeLocations = false,
                        safeLocationsError = error.message
                            ?: "Không thể tải điểm tránh trú"
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