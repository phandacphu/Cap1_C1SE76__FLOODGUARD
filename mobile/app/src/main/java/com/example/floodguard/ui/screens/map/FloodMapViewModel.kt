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
import kotlinx.coroutines.flow.update
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
        refreshMapData()
    }

    fun loadFloodAreas() {
        if (_uiState.value.isLoadingFloodAreas) return

        _uiState.update {
            it.copy(
                isLoadingFloodAreas = true,
                floodAreasError = null
            )
        }

        launchMapRequest(
            request = {
                val received:
                        List<com.example.floodguard.data.model.FloodAreaDto?> =
                    floodAreaRepository.getFloodAreas().getOrThrow()

                val records = received.filterNot { area ->
                    area != null && area.id in excludedDemoFloodAreaIds
                }

                val mapped = withContext(Dispatchers.Default) {
                    mapCitizenFloodAreas(records)
                }

                val acceptedIds = mapped.areas.map { it.id }.toSet()

                val acceptedRecords = records
                    .filterNotNull()
                    .filter { it.id in acceptedIds }

                acceptedRecords to mapped
            },
            onSuccess = { (records, mapped) ->
                _uiState.update { state ->
                    state.copy(
                        floodAreas = records,
                        citizenAreas = mapped.areas,
                        floodAreasUnsupportedTypeCount =
                            mapped.unsupportedTypeCount,
                        floodAreasInvalidRecordCount =
                            mapped.invalidRecordCount,
                        selectedCitizenAreaId =
                            state.selectedCitizenAreaId?.takeIf { id ->
                                mapped.areas.any { it.id == id }
                            },
                        floodAreasLoadedAt = System.currentTimeMillis(),
                        isLoadingFloodAreas = false,
                        floodAreasError = null
                    )
                }
            },
            onFailure = { error ->
                _uiState.update { state ->
                    state.copy(
                        isLoadingFloodAreas = false,
                        floodAreasError = mapLoadError(
                            sourceName = "vùng ngập và vùng trũng",
                            loadedAt = state.floodAreasLoadedAt,
                            error = error
                        )
                    )
                }
            }
        )
    }

    fun loadFloodAlerts() {
        if (_uiState.value.isLoadingFloodAlerts) return

        _uiState.update {
            it.copy(
                isLoadingFloodAlerts = true,
                floodAlertsError = null
            )
        }

        launchMapRequest(
            request = {
                floodAlertRepository.getActiveFloodAlerts()
                    .getOrThrow()
                    .filterNot { it.areaId in excludedDemoFloodAreaIds }
            },
            onSuccess = { alerts ->
                _uiState.update { state ->
                    state.copy(
                        floodAlerts = alerts,
                        selectedFloodAlertId =
                            state.selectedFloodAlertId?.takeIf { id ->
                                alerts.any { it.id == id }
                            },
                        floodAlertsLoadedAt = System.currentTimeMillis(),
                        isLoadingFloodAlerts = false,
                        floodAlertsError = null
                    )
                }
            },
            onFailure = { error ->
                _uiState.update { state ->
                    state.copy(
                        isLoadingFloodAlerts = false,
                        floodAlertsError = mapLoadError(
                            sourceName = "cảnh báo",
                            loadedAt = state.floodAlertsLoadedAt,
                            error = error
                        )
                    )
                }
            }
        )
    }


    fun loadSafeLocations() {
        if (_uiState.value.isLoadingSafeLocations) return

        _uiState.update {
            it.copy(
                isLoadingSafeLocations = true,
                safeLocationsError = null
            )
        }

        launchMapRequest(
            request = {
                safeLocationRepository.getSafeLocations()
                    .getOrThrow()
                    .filter { location ->
                        location.location.latitude.isFinite() &&
                                location.location.longitude.isFinite() &&
                                location.location.latitude in -90.0..90.0 &&
                                location.location.longitude in -180.0..180.0
                    }
            },
            onSuccess = { locations ->
                _uiState.update { state ->
                    state.copy(
                        safeLocations = locations,
                        selectedSafeLocationId =
                            state.selectedSafeLocationId?.takeIf { id ->
                                locations.any {
                                    it.id == id &&
                                            it.status.equals(
                                                "active",
                                                ignoreCase = true
                                            )
                                }
                            },
                        safeLocationsLoadedAt = System.currentTimeMillis(),
                        isLoadingSafeLocations = false,
                        safeLocationsError = null
                    )
                }
            },
            onFailure = { error ->
                _uiState.update { state ->
                    state.copy(
                        isLoadingSafeLocations = false,
                        safeLocationsError = mapLoadError(
                            sourceName = "điểm tránh trú",
                            loadedAt = state.safeLocationsLoadedAt,
                            error = error
                        )
                    )
                }
            }
        )
    }


    fun toggleUserLayer() {
        _uiState.value =
            _uiState.value.copy(
                isUserLayerEnabled =
                    !_uiState.value.isUserLayerEnabled
            )
    }
    fun toggleFloodLayer() {
        _uiState.update { state ->
            val enabled = !state.isFloodLayerEnabled

            state.copy(
                isFloodLayerEnabled = enabled,
                isHistoryPointsLayerEnabled = enabled,
                isHistoryBuffersLayerEnabled = false,
                isHistoryRadarLayerEnabled = false,
                selectedCitizenAreaId =
                    state.selectedCitizenAreaId.takeIf { enabled },
                selectedHistoryPoint =
                    state.selectedHistoryPoint.takeIf { enabled },
                selectedFloodAlertId =
                    state.selectedFloodAlertId.takeIf { enabled }
            )
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
                selectedFloodAlertId = alertId,
                selectedCitizenAreaId = null,
                selectedHistoryPoint = null,
                selectedSafeLocationId = null,
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
                else currentState.selectedFloodAlertId,
            selectedCitizenAreaId = null,
            selectedHistoryPoint = null
        )
    }

    fun toggleHistoryPointsLayer() {
        _uiState.update { state ->
            val enabled = !state.isHistoryPointsLayerEnabled

            state.copy(
                isHistoryPointsLayerEnabled = enabled,
                selectedHistoryPoint =
                    state.selectedHistoryPoint.takeIf { enabled }
            )
        }
    }


    fun loadHistoryPoints() {
        if (_uiState.value.isLoadingHistoryPoints) return

        _uiState.update {
            it.copy(
                historyPointsLoadStatus = HistoricalLoadStatus.LOADING,
                isLoadingHistoryPoints = true,
                historyPointsError = null
            )
        }

        launchMapRequest(
            request = {
                val geojson = floodHistoryRepository.getPoints()
                    .getOrThrow()

                withContext(Dispatchers.Default) {
                    parseHistoricalFloodPointsValidated(geojson)
                        .getOrThrow()
                }
            },
            onSuccess = { parsed ->
                _uiState.update { state ->
                    val selectedPoint = state.selectedHistoryPoint
                        ?.let { selected ->
                            if (selected.id != null) {
                                parsed.points.singleOrNull {
                                    it.id == selected.id
                                }
                            } else {
                                parsed.points.singleOrNull {
                                    it == selected
                                }
                            }
                        }

                    state.copy(
                        historyPoints = parsed.points,
                        selectedHistoryPoint = selectedPoint,
                        historyPointsInvalidFeatureCount =
                            parsed.invalidFeatureCount,
                        historyPointsLoadedAt = System.currentTimeMillis(),
                        historyPointsLoadStatus = HistoricalLoadStatus.SUCCESS,
                        isLoadingHistoryPoints = false,
                        historyPointsError = null
                    )
                }
            },
            onFailure = { error ->
                _uiState.update { state ->
                    state.copy(
                        historyPointsLoadStatus = HistoricalLoadStatus.FAILED,
                        isLoadingHistoryPoints = false,
                        historyPointsError = mapLoadError(
                            sourceName = "điểm ngập lịch sử",
                            loadedAt = state.historyPointsLoadedAt,
                            error = error
                        )
                    )
                }
            }
        )
    }


    fun toggleHistoryBuffersLayer() {
        _uiState.update {
            it.copy(
                isHistoryBuffersLayerEnabled =
                    !it.isHistoryBuffersLayerEnabled
            )
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
        _uiState.update {
            it.copy(
                isHistoryRadarLayerEnabled =
                    !it.isHistoryRadarLayerEnabled
            )
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
    fun refreshMapData() {
        val state = _uiState.value

        if (
            state.isLoadingFloodAreas ||
            state.isLoadingFloodAlerts ||
            state.isLoadingSafeLocations ||
            state.isLoadingHistoryPoints ||
            state.isLoadingHistoryBuffers ||
            state.isLoadingHistoryRadar
        ) {
            return
        }

        loadFloodAreas()
        loadFloodAlerts()
        loadSafeLocations()
        loadHistoryPoints()
    }

    private fun <T> launchMapRequest(
        request: suspend () -> T,
        onSuccess: (T) -> Unit,
        onFailure: (Throwable) -> Unit
    ) {
        viewModelScope.launch {
            try {
                onSuccess(request())
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                onFailure(error)
            }
        }
    }

    private fun mapLoadError(
        sourceName: String,
        loadedAt: Long?,
        error: Throwable
    ): String {
        val reason = error.message
            ?.takeIf { it.isNotBlank() }
            ?.let { " Chi tiết: $it" }
            .orEmpty()

        val previousData = if (loadedAt != null) {
            " Chưa cập nhật được; đang giữ dữ liệu lần tải thành công trước."
        } else {
            ""
        }

        return "Không thể tải $sourceName.$reason$previousData"
    }
    fun selectCitizenArea(areaId: String?) {
        _uiState.update { state ->
            state.copy(
                selectedCitizenAreaId = areaId?.takeIf { id ->
                    state.isFloodLayerEnabled &&
                            state.citizenAreas.any { it.id == id }
                },
                selectedHistoryPoint = null,
                selectedSafeLocationId = null,
                selectedFloodAlertId = null
            )
        }
    }

    fun selectHistoryPoint(point: HistoricalFloodPoint?) {
        _uiState.update { state ->
            state.copy(
                selectedHistoryPoint = point?.takeIf {
                    state.isFloodLayerEnabled &&
                            state.isHistoryPointsLayerEnabled &&
                            it in state.historyPoints
                },
                selectedCitizenAreaId = null,
                selectedSafeLocationId = null,
                selectedFloodAlertId = null
            )
        }
    }

    fun clearMapSelection() {
        _uiState.update {
            it.copy(
                selectedCitizenAreaId = null,
                selectedHistoryPoint = null,
                selectedSafeLocationId = null,
                selectedFloodAlertId = null
            )
        }
    }
}