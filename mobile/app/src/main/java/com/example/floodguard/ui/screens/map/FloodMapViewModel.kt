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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext


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

    private val excludedDemoFloodAreaIds = setOf(
        "ccf44-sample-flood-area-01",
        "TLpdPrxHD6D1pVECasus",
        "KzyV6q9mj5QkpxShKn3A"
    )

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
                            "FloodMapSource",
                            "id=${area.id}, " +
                                    "name=${area.name}, " +
                                    "source=${area.source}, " +
                                    "status=${area.status}, " +
                                    "severity=${area.severity}, " +
                                    "points=${area.geometry.points.size}"
                        )
                    }

                    _uiState.value =
                        _uiState.value.copy(
                            floodAreas = floodAreas.filterNot { area ->
                                area.id in excludedDemoFloodAreaIds
                            },
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
                            floodAlerts = floodAlerts.filterNot { alert ->
                                alert.areaId in excludedDemoFloodAreaIds
                            },
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
                    locations.forEach { location ->
                        Log.d(
                            "SafeLocationSource",
                            "id=${location.id}, " +
                                    "name=${location.name}, " +
                                    "status=${location.status}, " +
                                    "lat=${location.location.latitude}, " +
                                    "lng=${location.location.longitude}"
                        )
                    }
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


    fun toggleUserLayer() {
        _uiState.value =
            _uiState.value.copy(
                isUserLayerEnabled =
                    !_uiState.value.isUserLayerEnabled
            )
    }
    fun toggleFloodLayer() {
        val currentState = _uiState.value
        val enabled = !currentState.isFloodLayerEnabled

        _uiState.value = currentState.copy(
            isFloodLayerEnabled = enabled,
            isHistoryPointsLayerEnabled = enabled,
            isHistoryBuffersLayerEnabled = enabled,
            isHistoryRadarLayerEnabled = enabled
        )

        if (!enabled) {
            return
        }

        if (
            currentState.historyPointsLoadStatus !=
            HistoricalLoadStatus.SUCCESS &&
            currentState.historyPointsLoadStatus !=
            HistoricalLoadStatus.LOADING
        ) {
            loadHistoryPoints()
        }

        if (
            currentState.historyBuffersLoadStatus !=
            HistoricalLoadStatus.SUCCESS &&
            currentState.historyBuffersLoadStatus !=
            HistoricalLoadStatus.LOADING
        ) {
            loadHistoryBuffers()
        }

        if (
            currentState.historyRadarLoadStatus !=
            HistoricalLoadStatus.SUCCESS &&
            currentState.historyRadarLoadStatus !=
            HistoricalLoadStatus.LOADING
        ) {
            loadHistoryRadar()
        }
    }

    fun toggleShelterLayer() {
        val currentState = _uiState.value
        val enabled = !currentState.isShelterLayerEnabled

        _uiState.value = currentState.copy(
            isShelterLayerEnabled = enabled,
            selectedSafeLocationId =
                if (enabled) currentState.selectedSafeLocationId
                else null
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

    fun selectSafeLocation(locationId: String?) {
        val currentState = _uiState.value

        val selectedId = locationId?.takeIf { id ->
            currentState.isShelterLayerEnabled &&
                    currentState.safeLocations.any { location ->
                        location.id == id &&
                                location.status.equals(
                                    "active",
                                    ignoreCase = true
                                )
                    }
        }

        _uiState.value = currentState.copy(
            selectedSafeLocationId = selectedId,
            selectedFloodAlertId =
                if (selectedId != null) null
                else currentState.selectedFloodAlertId
        )
    }

    fun toggleHistoryPointsLayer() {
        val enabled =
            !_uiState.value.isHistoryPointsLayerEnabled

        _uiState.value = _uiState.value.copy(
            isHistoryPointsLayerEnabled = enabled
        )

        val loadStatus =
            _uiState.value.historyPointsLoadStatus

        if (
            enabled &&
            loadStatus != HistoricalLoadStatus.SUCCESS &&
            loadStatus != HistoricalLoadStatus.LOADING
        ) {
            loadHistoryPoints()
        }
    }


    fun loadHistoryPoints() {

        if (
            _uiState.value.historyPointsLoadStatus ==
            HistoricalLoadStatus.LOADING
        ) {
            return
        }

        _uiState.value = _uiState.value.copy(
            historyPointsLoadStatus =
                HistoricalLoadStatus.LOADING,
            isLoadingHistoryPoints = true,
            historyPointsError = null,
            historyPointsInvalidFeatureCount = 0
        )

        viewModelScope.launch {

            try {
                val geojson =
                    floodHistoryRepository.getPoints()
                        .getOrThrow()

                val parsed = withContext(Dispatchers.Default) {
                    parseHistoricalFloodPointsValidated(geojson)
                        .getOrThrow()
                }

                _uiState.value = _uiState.value.copy(
                    historyPoints = parsed.points,
                    historyPointsInvalidFeatureCount =
                        parsed.invalidFeatureCount,
                    historyPointsLoadStatus =
                        HistoricalLoadStatus.SUCCESS,
                    isLoadingHistoryPoints = false,
                    historyPointsError = null
                )

            } catch (error: CancellationException) {
                throw error

            } catch (error: Exception) {

                _uiState.value = _uiState.value.copy(
                    historyPoints = emptyList(),
                    historyPointsInvalidFeatureCount = 0,
                    historyPointsLoadStatus =
                        HistoricalLoadStatus.FAILED,
                    isLoadingHistoryPoints = false,
                    historyPointsError =
                        error.message
                            ?: "Không thể tải điểm ngập lịch sử."
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

        val loadStatus =
            _uiState.value.historyBuffersLoadStatus

        if (
            enabled &&
            loadStatus != HistoricalLoadStatus.SUCCESS &&
            loadStatus != HistoricalLoadStatus.LOADING
        ) {
            loadHistoryBuffers()
        }
    }


    fun loadHistoryBuffers() {

        if (
            _uiState.value.historyBuffersLoadStatus ==
            HistoricalLoadStatus.LOADING
        ) {
            return
        }

        _uiState.value = _uiState.value.copy(
            historyBuffersLoadStatus =
                HistoricalLoadStatus.LOADING,
            isLoadingHistoryBuffers = true,
            historyBuffersError = null
        )

        viewModelScope.launch {

            try {
                val geojson =
                    floodHistoryRepository.getBuffers()
                        .getOrThrow()


                val (featureCount, polygons, mapPolygons) =
                    withContext(Dispatchers.Default) {

                        val featureGroups =
                            parseHistoricalFloodPolygonFeatures(
                                geojson
                            ).getOrThrow()

                        val polygons = featureGroups.flatten()

                        Triple(
                            featureGroups.size,
                            polygons,
                            prepareHistoricalMapPolygons(polygons)
                        )
                    }

                _uiState.value = _uiState.value.copy(
                    historyBufferFeatureCount = featureCount,
                    historyBufferPolygons = polygons,
                    historyBufferMapPolygons = mapPolygons,
                    historyBuffersLoadStatus =
                        HistoricalLoadStatus.SUCCESS,
                    isLoadingHistoryBuffers = false,
                    historyBuffersError = null
                )

            } catch (error: CancellationException) {
                throw error

            } catch (error: Exception) {

                _uiState.value = _uiState.value.copy(
                    historyBufferFeatureCount = 0,
                    historyBufferPolygons = emptyList(),
                    historyBufferMapPolygons = emptyList(),
                    historyBuffersLoadStatus =
                        HistoricalLoadStatus.FAILED,
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

        val loadStatus =
            _uiState.value.historyRadarLoadStatus

        if (
            enabled &&
            loadStatus != HistoricalLoadStatus.SUCCESS &&
            loadStatus != HistoricalLoadStatus.LOADING
        ) {
            loadHistoryRadar()
        }
    }


    fun loadHistoryRadar() {

        if (
            _uiState.value.historyRadarLoadStatus ==
            HistoricalLoadStatus.LOADING
        ) {
            return
        }

        _uiState.value = _uiState.value.copy(
            historyRadarLoadStatus =
                HistoricalLoadStatus.LOADING,
            isLoadingHistoryRadar = true,
            historyRadarError = null
        )

        viewModelScope.launch {

            try {
                val geojson =
                    floodHistoryRepository.getRadar()
                        .getOrThrow()


                val (featureCount, polygons, mapPolygons) =
                    withContext(Dispatchers.Default) {

                        val featureGroups =
                            parseHistoricalFloodPolygonFeatures(
                                geojson
                            ).getOrThrow()

                        val polygons = featureGroups.flatten()

                        Triple(
                            featureGroups.size,
                            polygons,
                            prepareHistoricalMapPolygons(polygons)
                        )
                    }

                _uiState.value = _uiState.value.copy(
                    historyRadarFeatureCount = featureCount,
                    historyRadarPolygons = polygons,
                    historyRadarMapPolygons = mapPolygons,
                    historyRadarLoadStatus =
                        HistoricalLoadStatus.SUCCESS,
                    isLoadingHistoryRadar = false,
                    historyRadarError = null
                )

            } catch (error: CancellationException) {
                throw error

            } catch (error: Exception) {

                _uiState.value = _uiState.value.copy(
                    historyRadarFeatureCount = 0,
                    historyRadarPolygons = emptyList(),
                    historyRadarMapPolygons = emptyList(),
                    historyRadarLoadStatus =
                        HistoricalLoadStatus.FAILED,
                    isLoadingHistoryRadar = false,
                    historyRadarError =
                        error.message
                            ?: "Không thể tải dữ liệu Radar."
                )
            }
        }
    }

    private fun prepareHistoricalMapPolygons(
        polygons: List<HistoricalFloodPolygon>
    ): List<HistoricalMapPolygon> {

        return polygons.map { polygon ->
            HistoricalMapPolygon(
                outer = polygon.outer.map { point ->
                    com.google.android.gms.maps.model.LatLng(
                        point.latitude,
                        point.longitude
                    )
                },
                holes = polygon.holes.map { hole ->
                    hole.map { point ->
                        com.google.android.gms.maps.model.LatLng(
                            point.latitude,
                            point.longitude
                        )
                    }
                }
            )
        }
    }
}