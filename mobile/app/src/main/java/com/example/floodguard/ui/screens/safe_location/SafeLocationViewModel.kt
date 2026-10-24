
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

class SafeLocationViewModel(
    private val repository: SafeLocationRepository
) : ViewModel() {

    private var allLocations: List<SafeLocation> = emptyList()

    private val _uiState = MutableStateFlow(
        SafeLocationUiState(isLoading = true)
    )

    val uiState: StateFlow<SafeLocationUiState> =
        _uiState.asStateFlow()

    init {
        loadLocations()
    }

    fun loadLocations() {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = true,
                    errorMessage = null
                )
            }

            repository.getSafeLocations()
                .onSuccess { dtos ->
                    val locations = dtos.mapNotNull { dto ->
                        try {
                            val location = dto.toDomain()

                            if (
                                location.latitude.isFinite() &&
                                location.longitude.isFinite() &&
                                location.latitude in -90.0..90.0 &&
                                location.longitude in -180.0..180.0
                            ) {
                                location
                            } else {
                                null
                            }
                        } catch (e: Exception) {
                            null
                        }
                    }

                    allLocations = locations

                    _uiState.update { state ->
                        state.copy(
                            isLoading = false,
                            locations = filterLocations(
                                state.selectedFilter
                            ),
                            errorMessage = null
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            locations = emptyList(),
                            errorMessage =
                                error.message
                                    ?: "Không thể tải danh sách điểm tránh trú"
                        )
                    }
                }
        }
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
