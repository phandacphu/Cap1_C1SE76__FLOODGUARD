
package com.example.floodguard.ui.screens.safe_location

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.mapper.toDomain
import com.example.floodguard.data.repository.SafeLocationRepository
import com.example.floodguard.domain.model.SafeLocation
import com.example.floodguard.domain.model.SafeLocationFacility
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive

class SafeLocationViewModel(
    private val repository: SafeLocationRepository
) : ViewModel() {

    private var allLocations: List<SafeLocation> = emptyList()

    private var gpsCoordinates: Pair<Double, Double>? = null
    private var loadJob: Job? = null

    private val _uiState = MutableStateFlow(
        SafeLocationUiState(isLoading = true)
    )

    val uiState: StateFlow<SafeLocationUiState> =
        _uiState.asStateFlow()

    init {
        loadLocations()
    }

    fun updateDeviceLocation(location: android.location.Location?) {
        updateGps(location?.latitude, location?.longitude, location)
    }

    fun updateGps(
        latitude: Double?,
        longitude: Double?,
        deviceLocation: android.location.Location? = null
    ) {
        val coordinates = if (
            latitude != null && latitude in -90.0..90.0 &&
            longitude != null && longitude in -180.0..180.0
        ) {
            latitude to longitude
        } else {
            null
        }

        val fix = deviceLocation
            ?.takeIf { coordinates != null }
            ?.let { android.location.Location(it) }

        if (gpsCoordinates == coordinates) {
            _uiState.update { it.copy(deviceLocation = fix) }
            return
        }

        gpsCoordinates = coordinates
        allLocations = allLocations.map {
            it.copy(distanceKm = null, distanceMeters = null)
        }
        _uiState.update {
            it.copy(
                locations = allLocations,
                latitude = coordinates?.first,
                longitude = coordinates?.second,
                deviceLocation = fix,
            )
        }
        loadLocations()
    }

    fun loadLocations() {
        loadJob?.cancel()
        val coordinates = gpsCoordinates

        _uiState.update {
            it.copy(isLoading = true, errorMessage = null)
        }

        loadJob = viewModelScope.launch {
            val result = repository.getSafeLocations(
                latitude = coordinates?.first,
                longitude = coordinates?.second
            ).mapCatching { dtos ->
                val locations = dtos.mapNotNull { dto ->
                    runCatching { dto.toDomain() }.getOrNull()
                }

                check(dtos.isEmpty() || locations.isNotEmpty()) {
                    "Danh mục điểm tránh trú chứa dữ liệu không hợp lệ"
                }

                locations
            }

            ensureActive()

            result.onSuccess { locations ->
                allLocations = locations
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        locations = locations,
                        errorMessage = null
                    )
                }
            }.onFailure {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Chưa thể cập nhật"
                    )
                }
            }
        }
    }

    fun removeUnavailableLocation(locationId: String) {
        allLocations = allLocations.filterNot { it.id == locationId }
        _uiState.update { state ->
            state.copy(
                locations = state.locations.filterNot { it.id == locationId }
            )
        }
        loadLocations()
    }

    fun refresh() {
        loadLocations()
    }

    fun getLocationById(locationId: String): SafeLocation? {
        return allLocations.find {
            it.id == locationId
        }
    }

    fun selectFilter(filter: SafeLocationFilter) {
        _uiState.update {
            it.copy(
                selectedFilter = filter,
                locations = filterLocations(filter)
            )
        }
    }

    private fun filterLocations(
        filter: SafeLocationFilter
    ): List<SafeLocation> {
        return when (filter) {

            SafeLocationFilter.ALL ->
                allLocations

            SafeLocationFilter.NEAREST ->
                allLocations.sortedWith(
                    compareBy<SafeLocation> {
                        it.distanceMeters == null
                    }.thenBy {
                        it.distanceMeters ?: Int.MAX_VALUE
                    }
                )

            SafeLocationFilter.AVAILABLE ->
                // Backend chưa cung cấp số chỗ còn lại.
                // Không thể xác định địa điểm nào còn chỗ.
                emptyList()

            SafeLocationFilter.MEDICAL ->
                allLocations.filter { location ->
                    SafeLocationFacility.MEDICAL in location.facilities ||
                            SafeLocationFacility.EMERGENCY_CARE in location.facilities ||
                            SafeLocationFacility.DOCTOR in location.facilities
                }
        }
    }
}
