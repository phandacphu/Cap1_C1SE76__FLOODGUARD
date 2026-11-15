package com.example.floodguard.ui.screens.safe_location

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.mapper.toDomain
import com.example.floodguard.data.repository.SafeLocationRepository
import com.example.floodguard.domain.model.SafeLocation
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

class SafeLocationDetailViewModel(
    private val repository: SafeLocationRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        SafeLocationDetailUiState(isLoading = true)
    )
    val uiState: StateFlow<SafeLocationDetailUiState> = _uiState.asStateFlow()

    private var loadJob: Job? = null

    private var lastLocationId: String? = null
    private var lastCoordinates: Pair<Double?, Double?>? = null

    fun retry() {
        val id = lastLocationId ?: return
        loadLocation(id, lastCoordinates?.first, lastCoordinates?.second)
    }

    fun loadLocation(
        locationId: String,
        latitude: Double? = null,
        longitude: Double? = null,
        cachedLocation: SafeLocation? = null
    ) {
        loadJob?.cancel()
        val coordinates = latitude to longitude
        val previousLocation = _uiState.value.location
            ?.takeIf { it.id == locationId }
            ?.let { location ->
                if (lastCoordinates == coordinates) location
                else location.copy(distanceKm = null, distanceMeters = null)
            }
            ?: cachedLocation
                ?.takeIf { it.id == locationId && !_uiState.value.isUnavailable }
                ?.let { location ->
                    if (latitude != null && longitude != null) location
                    else location.copy(distanceKm = null, distanceMeters = null)
                }



        lastLocationId = locationId
        lastCoordinates = coordinates
        _uiState.value = SafeLocationDetailUiState(
            isLoading = true,
            location = previousLocation,
            isMockData = false
        )

        loadJob = viewModelScope.launch {
            val result = repository.getSafeLocation(
                id = locationId,
                latitude = latitude,
                longitude = longitude
            )
                .mapCatching { it.toDomain() }

            ensureActive()

            _uiState.value = result.fold(
                onSuccess = { location ->
                    SafeLocationDetailUiState(
                        location = location,
                        isMockData = false
                    )
                },
                onFailure = { error ->
                    val isUnavailable = error is HttpException && error.code() == 404

                    SafeLocationDetailUiState(
                        location = previousLocation.takeUnless { isUnavailable },
                        errorMessage = if (isUnavailable) {
                            "Địa điểm không còn được cung cấp"
                        } else {
                            "Chưa thể cập nhật"
                        },
                        isUnavailable = isUnavailable,
                        isMockData = false
                    )
                }
            )
        }
    }
}