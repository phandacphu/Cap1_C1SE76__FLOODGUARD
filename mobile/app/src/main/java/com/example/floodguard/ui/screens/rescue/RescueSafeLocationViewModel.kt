package com.example.floodguard.ui.screens.rescue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.RescueCatalogFailureKind
import com.example.floodguard.data.repository.RescueCatalogGps
import com.example.floodguard.data.repository.RescueCatalogLocation
import com.example.floodguard.data.repository.RescueCatalogResult
import com.example.floodguard.data.repository.RescueSafeLocationRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import com.example.floodguard.data.repository.RescueSafeLocationRoadRepository
import com.example.floodguard.data.repository.SafeRoadEstimate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RescueSafeLocationListUiState(
    val locations: List<RescueCatalogLocation> = emptyList(),
    val isLoading: Boolean = true,
    val hasLoaded: Boolean = false,
    val errorMessage: String? = null,
    val isStale: Boolean = false,
    val gps: RescueCatalogGps? = null,
    val usingLastKnownGps: Boolean = false,
    val roadEstimates: Map<String, SafeRoadEstimate> = emptyMap(),
    val roadLoading: Boolean = false
)

data class RescueSafeLocationDetailUiState(
    val id: String? = null,
    // Unique navigation-entry ownership, not the shared safe-location ID.
    val ownerKey: String? = null,
    val location: RescueCatalogLocation? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isStale: Boolean = false,
    val noLongerAvailable: Boolean = false
) {
    val canOpenDirections: Boolean
        get() = location != null && !isStale && !noLongerAvailable
}

class RescueSafeLocationViewModel(
    private val repository: RescueSafeLocationRepository,
    private val roadRepository: RescueSafeLocationRoadRepository? = null
) : ViewModel() {

    private val _listState =
        MutableStateFlow(RescueSafeLocationListUiState())
    val listState: StateFlow<RescueSafeLocationListUiState> =
        _listState.asStateFlow()

    private val _detailState =
        MutableStateFlow(RescueSafeLocationDetailUiState())
    val detailState: StateFlow<RescueSafeLocationDetailUiState> =
        _detailState.asStateFlow()

    private var currentGps: RescueCatalogGps? = null
    private var usingLastKnownGps: Boolean = false

    private var listJob: Job? = null
    private var detailJob: Job? = null

    private var listVersion = 0L
    private var detailVersion = 0L

    private var listScreenHasOpened = false

    init {
        // The catalogue can load without a location permission.
        refreshLocations()
    }

    fun onListScreenEntered() {
        // Initial load is already started by init.
        if (!listScreenHasOpened) {
            listScreenHasOpened = true
            return
        }

        // Returning from Detail refreshes the catalogue.
        refreshLocations()
    }

    fun onGpsChanged(
        gps: RescueCatalogGps?,
        fromLastKnown: Boolean = false
    ) {
        val validGps = gps?.takeIf { it.isValid() }
        val lastKnown = validGps != null && fromLastKnown

        if (currentGps == validGps) {
            if (usingLastKnownGps != lastKnown) {
                usingLastKnownGps = lastKnown
                _listState.update {
                    it.copy(usingLastKnownGps = lastKnown)
                }
            }
            return
        }

        currentGps = validGps
        usingLastKnownGps = lastKnown

        // Immediately invalidate distance from the previous GPS fix.
        _listState.update { previous ->
            previous.copy(
                locations = previous.locations.map {
                    it.copy(distanceKm = null)
                },
                gps = validGps,
                roadEstimates = emptyMap(),
                roadLoading = false,
                usingLastKnownGps = lastKnown,
                errorMessage = null,
                isStale = previous.hasLoaded
            )
        }

        _detailState.update { previous ->
            previous.copy(
                location = previous.location?.copy(distanceKm = null),
                errorMessage = null
            )
        }

        refreshLocations()

        if (_detailState.value.id != null) {
            refreshDetail()
        }
    }

    fun refreshLocations() {
        listJob?.cancel()
        val version = ++listVersion
        val requestedGps = currentGps

        _listState.update {
            it.copy(
                isLoading = true,
                roadEstimates = emptyMap(),
                roadLoading = false,
                errorMessage = null,
                isStale = it.hasLoaded
            )
        }

        listJob = viewModelScope.launch {
            val result = repository.getLocations(requestedGps)

            if (version != listVersion || currentGps != requestedGps) {
                return@launch
            }

            when (result) {
                is RescueCatalogResult.Success -> {
                    _listState.update {
                        it.copy(
                            locations = result.data,
                            isLoading = false,
                            hasLoaded = true,
                            errorMessage = null,
                            isStale = false
                        )
                    }

                    if (
                        requestedGps != null &&
                        roadRepository != null &&
                        result.data.isNotEmpty()
                    ) {
                        _listState.update {
                            it.copy(roadLoading = true)
                        }

                        val estimates = try {
                            roadRepository.estimate(
                                requestedGps,
                                result.data
                            )
                        } catch (error: CancellationException) {
                            throw error
                        } catch (_: Exception) {
                            emptyMap()
                        }

                        if (
                            version != listVersion ||
                            currentGps != requestedGps
                        ) {
                            return@launch
                        }

                        val ordered = result.data.sortedWith(
                            compareBy<RescueCatalogLocation> {
                                estimates[it.id]?.meters ?: Long.MAX_VALUE
                            }.thenBy { it.id }
                        )

                        _listState.update {
                            it.copy(
                                locations = ordered,
                                roadEstimates = estimates,
                                roadLoading = false
                            )
                        }
                    }
                }

                is RescueCatalogResult.Failure -> {
                    _listState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = result.message,
                            isStale = it.hasLoaded
                        )
                    }
                }
            }
        }
    }

    // The navigation entry owns the detail, not merely its location ID.
    // The default key preserves existing callers/tests; navigation must pass
    // NavBackStackEntry.id to distinguish repeated visits to the same ID.
    fun openDetail(id: String, ownerKey: String = id) {
        if (id.isBlank() || ownerKey.isBlank()) return

        if (
            _detailState.value.id != id ||
            _detailState.value.ownerKey != ownerKey
        ) {
            detailJob?.cancel()
            ++detailVersion

            // Reopening A must clear the old A, even when IDs match.
            _detailState.value = RescueSafeLocationDetailUiState(
                id = id,
                ownerKey = ownerKey
            )
        }

        refreshDetail(ownerKey)
    }

    // A GPS effect belonging to an outgoing entry cannot change the active
    // entry's GPS, cancel its request, or overwrite its detail state.
    fun onDetailGpsChanged(
        ownerKey: String,
        gps: RescueCatalogGps?,
        fromLastKnown: Boolean = false
    ) {
        if (_detailState.value.ownerKey != ownerKey) return
        onGpsChanged(gps, fromLastKnown)
    }

    fun refreshDetail(expectedOwner: String? = null) {
        val active = _detailState.value
        val id = active.id ?: return
        val ownerKey = active.ownerKey ?: return
        if (expectedOwner != null && expectedOwner != ownerKey) return

        detailJob?.cancel()
        val version = ++detailVersion
        val requestedGps = currentGps

        _detailState.update {
            it.copy(
                isLoading = true,
                errorMessage = null,
                noLongerAvailable = false
            )
        }

        detailJob = viewModelScope.launch {
            val result = repository.getDetail(id, requestedGps)

            if (
                version != detailVersion ||
                currentGps != requestedGps ||
                _detailState.value.id != id ||
                _detailState.value.ownerKey != ownerKey
            ) {
                return@launch
            }

            when (result) {
                is RescueCatalogResult.Success -> {
                    _detailState.update {
                        it.copy(
                            location = result.data,
                            isLoading = false,
                            errorMessage = null,
                            isStale = false,
                            noLongerAvailable = false
                        )
                    }
                }

                is RescueCatalogResult.Failure -> {
                    // Only HTTP 404 confirms that a location is unavailable.
                    val missing =
                        result.kind == RescueCatalogFailureKind.NOT_FOUND

                    _detailState.update {
                        it.copy(
                            location = if (missing) null else it.location,
                            isLoading = false,
                            errorMessage = if (missing) {
                                "Địa điểm không còn được cung cấp."
                            } else {
                                result.message
                            },
                            isStale = !missing && it.location != null,
                            noLongerAvailable = missing
                        )
                    }

                    if (missing) {
                        // Refresh the list so a deleted item can disappear.
                        refreshLocations()
                    }
                }
            }
        }
    }

    fun closeDetail(
        expectedId: String? = null,
        expectedOwner: String? = null
    ) {
        // An outgoing A must not close a new A with another navigation owner.
        if (expectedId != null && _detailState.value.id != expectedId) return
        if (expectedOwner != null && _detailState.value.ownerKey != expectedOwner) return

        detailJob?.cancel()
        ++detailVersion
        _detailState.value = RescueSafeLocationDetailUiState()
    }

    override fun onCleared() {
        listJob?.cancel()
        detailJob?.cancel()
        super.onCleared()
    }
}
