package com.example.floodguard.ui.screens.map

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.FloodAreaRepository
import com.example.floodguard.data.repository.FloodAlertRepository
import com.example.floodguard.data.repository.FloodHistoryRepository
import com.example.floodguard.data.repository.SafeLocationRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch


class FloodMapViewModel(
    private val floodAreaRepository: FloodAreaRepository,
    private val floodAlertRepository: FloodAlertRepository,
    private val safeLocationRepository: SafeLocationRepository,
    private val floodHistoryRepository: FloodHistoryRepository
) : ViewModel() {


    private val _uiState = MutableStateFlow(
        FloodMapUiState()
    )

    val uiState: StateFlow<FloodMapUiState> =
        _uiState.asStateFlow()

    private var historyPointsLoaded = false

    private var historyBuffersLoaded = false

    private var historyRadarLoaded = false




    init {
        loadFloodAreas()
        loadFloodAlerts()
        loadSafeLocations()

        // Historical Flood Map
        loadHistoryPoints()
        loadHistoryBuffers()
        loadHistoryRadar()
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

                    Log.d(
                        "FloodMapTC04",
                        "API returned ${floodAreas.size} flood areas"
                    )

                    floodAreas.forEach { area ->
                        Log.d(
                            "FloodMapTC04",
                            "id=${area.id}, " +
                                    "status=${area.status}, " +
                                    "severity=${area.severity}, " +
                                    "type=${area.geometry.type}, " +
                                    "points=${area.geometry.points.joinToString { point ->
                                        "(${point.latitude}, ${point.longitude})"
                                    }}"
                        )
                    }

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
                            floodAreas = emptyList(),
                            isLoadingFloodAreas = false,
                            floodAreasError =
                                "Không thể cập nhật vùng ngập. " +
                                        "Vui lòng kiểm tra kết nối mạng và thử lại."
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
                            floodAlerts = emptyList(),
                            selectedFloodAlertId = null,
                            isLoadingFloodAlerts = false,
                            floodAlertsError =
                                "Không thể cập nhật cảnh báo lũ. " +
                                        "Vui lòng kiểm tra kết nối mạng và thử lại."
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

    fun toggleHistoryPointsLayer() {
        val enabled =
            !_uiState.value.isHistoryPointsLayerEnabled

        _uiState.value = _uiState.value.copy(
            isHistoryPointsLayerEnabled = enabled
        )

        if (enabled && !historyPointsLoaded) {
            loadHistoryPoints()
        }
    }

    fun loadHistoryPoints() {
        if (_uiState.value.isLoadingHistoryPoints) return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isLoadingHistoryPoints = true,
                historyPointsError = null
            )

            floodHistoryRepository.getPoints()
                .onSuccess { geojson ->
                    val points =
                        parseHistoricalFloodPoints(geojson)

                    historyPointsLoaded = true

                    _uiState.value = _uiState.value.copy(
                        historyPoints = points,
                        isLoadingHistoryPoints = false,
                        historyPointsError = null
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoadingHistoryPoints = false,
                        historyPointsError =
                            error.message
                                ?: "Không thể tải điểm ngập lịch sử"
                    )
                }
        }
    }

    fun toggleHistoryBuffersLayer() {
        val enabled =
            !_uiState.value.isHistoryBuffersLayerEnabled

        _uiState.value = _uiState.value.copy(
            isHistoryBuffersLayerEnabled = enabled
        )

        if (enabled && !historyBuffersLoaded) {
            loadHistoryBuffers()
        }
    }

    fun loadHistoryBuffers() {

        if (_uiState.value.isLoadingHistoryBuffers) return

        viewModelScope.launch {

            _uiState.value = _uiState.value.copy(
                isLoadingHistoryBuffers = true,
                historyBuffersError = null
            )

            floodHistoryRepository.getBuffers()
                .onSuccess { geojson ->

                    parseHistoricalFloodPolygonFeatures(geojson)
                        .onSuccess { featureGroups ->

                            historyBuffersLoaded = true

                            _uiState.value = _uiState.value.copy(
                                historyBufferFeatureCount =
                                    featureGroups.size,

                                historyBufferPolygons =
                                    featureGroups.flatten(),

                                isLoadingHistoryBuffers = false,
                                historyBuffersError = null
                            )
                        }
                        .onFailure { error ->

                            _uiState.value = _uiState.value.copy(
                                isLoadingHistoryBuffers = false,
                                historyBuffersError =
                                    "Dữ liệu vùng đệm không hợp lệ: " +
                                            (error.message ?: "Lỗi GeoJSON")
                            )
                        }
                }
                .onFailure { error ->

                    _uiState.value = _uiState.value.copy(
                        isLoadingHistoryBuffers = false,
                        historyBuffersError =
                            error.message
                                ?: "Không thể tải vùng đệm lịch sử."
                    )
                }
        }
    }

    fun toggleHistoryRadarLayer() {

        val enabled =
            !_uiState.value.isHistoryRadarLayerEnabled

        _uiState.value = _uiState.value.copy(
            isHistoryRadarLayerEnabled = enabled
        )

        if (enabled && !historyRadarLoaded) {
            loadHistoryRadar()
        }
    }

    fun loadHistoryRadar() {

        if (_uiState.value.isLoadingHistoryRadar) return

        viewModelScope.launch {

            _uiState.value = _uiState.value.copy(
                isLoadingHistoryRadar = true,
                historyRadarError = null
            )

            floodHistoryRepository.getRadar()
                .onSuccess { geojson ->

                    parseHistoricalFloodPolygonFeatures(geojson)
                        .onSuccess { featureGroups ->

                            historyRadarLoaded = true

                            _uiState.value = _uiState.value.copy(
                                historyRadarFeatureCount =
                                    featureGroups.size,

                                historyRadarPolygons =
                                    featureGroups.flatten(),

                                isLoadingHistoryRadar = false,
                                historyRadarError = null
                            )
                        }
                        .onFailure { error ->

                            _uiState.value = _uiState.value.copy(
                                isLoadingHistoryRadar = false,
                                historyRadarError =
                                    "Dữ liệu Radar không hợp lệ: " +
                                            (error.message ?: "Lỗi GeoJSON")
                            )
                        }
                }
                .onFailure { error ->

                    _uiState.value = _uiState.value.copy(
                        isLoadingHistoryRadar = false,
                        historyRadarError =
                            error.message
                                ?: "Không thể tải dữ liệu Radar."
                    )
                }
        }
    }
}