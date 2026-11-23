package com.example.floodguard.ui.screens.rescue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.RescueFloodWarningV2
import com.example.floodguard.data.repository.RescueFloodWarningV2Repository
import com.example.floodguard.data.repository.RescueFloodWarningV2ZonesRepository
import com.example.floodguard.data.repository.RescueWarningV2FailureKind
import com.example.floodguard.data.repository.RescueWarningV2Result
import com.example.floodguard.data.repository.RescueWarningZonesSnapshot
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class RescueWarningV2Filter(val apiStatus: String?) {
    ALL(null),
    ACTIVE("active"),
    INACTIVE("inactive")
}

data class RescueWarningV2OverviewState(
    val warnings: List<RescueFloodWarningV2> = emptyList(),
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val isStale: Boolean = false,
    val errorMessage: String? = null
) {
    val activeCount: Int
        get() = warnings.count { it.isActive }

    val latestWarning: RescueFloodWarningV2?
        get() = warnings.firstOrNull()
}

data class RescueWarningV2ListState(
    val filter: RescueWarningV2Filter = RescueWarningV2Filter.ALL,
    val query: String = "",
    val warnings: List<RescueFloodWarningV2> = emptyList(),
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val isStale: Boolean = false,
    val errorMessage: String? = null
)

data class RescueWarningV2DetailState(
    val id: String? = null,
    val ownerKey: String? = null,
    val warning: RescueFloodWarningV2? = null,
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val isStale: Boolean = false,
    val notFound: Boolean = false,
    val errorMessage: String? = null
)

data class RescueWarningV2MapState(
    val snapshot: RescueWarningZonesSnapshot? = null,
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val isStale: Boolean = false,
    val errorMessage: String? = null
)

class RescueFloodWarningV2ViewModel(
    private val repository: RescueFloodWarningV2Repository,
    private val zonesRepository: RescueFloodWarningV2ZonesRepository
) : ViewModel() {

    private val _overviewState =
        MutableStateFlow(RescueWarningV2OverviewState())
    val overviewState: StateFlow<RescueWarningV2OverviewState> =
        _overviewState.asStateFlow()

    private val _listState =
        MutableStateFlow(RescueWarningV2ListState())
    val listState: StateFlow<RescueWarningV2ListState> =
        _listState.asStateFlow()

    private val _detailState =
        MutableStateFlow(RescueWarningV2DetailState())
    val detailState: StateFlow<RescueWarningV2DetailState> =
        _detailState.asStateFlow()

    private val _mapState =
        MutableStateFlow(RescueWarningV2MapState())
    val mapState: StateFlow<RescueWarningV2MapState> =
        _mapState.asStateFlow()

    private val _accessFailure =
        MutableStateFlow<RescueWarningV2FailureKind?>(null)
    val accessFailure: StateFlow<RescueWarningV2FailureKind?> =
        _accessFailure.asStateFlow()

    private var overviewJob: Job? = null
    private var listJob: Job? = null
    private var detailJob: Job? = null
    private var mapJob: Job? = null

    private var overviewVersion = 0L
    private var listVersion = 0L
    private var detailVersion = 0L
    private var mapVersion = 0L
    private var accessEpoch = 0L

    private var overviewEntries = 0
    private var listEntries = 0

    fun onOverviewEntered() {
        if (isLocked()) return
        overviewEntries++
        refreshOverview()
    }

    fun refreshOverview() {
        if (isLocked()) return

        overviewJob?.cancel()
        val version = ++overviewVersion
        val epoch = accessEpoch

        val previous = _overviewState.value
        _overviewState.value = previous.copy(
            isLoading = true,
            isStale = previous.hasLoaded,
            errorMessage = null
        )

        overviewJob = viewModelScope.launch {
            // Overview shows active count and the latest overall alert.
            val result = repository.getWarnings()

            if (handleAccessFailure(result)) return@launch

            if (
                version != overviewVersion ||
                epoch != accessEpoch ||
                isLocked()
            ) return@launch

            when (result) {
                is RescueWarningV2Result.Success -> {
                    _overviewState.value = RescueWarningV2OverviewState(
                        warnings = result.data,
                        hasLoaded = true
                    )
                }

                is RescueWarningV2Result.Failure -> {
                    _overviewState.value =
                        _overviewState.value.copy(
                            isLoading = false,
                            isStale = _overviewState.value.hasLoaded,
                            errorMessage = result.message
                        )
                }
            }
        }
    }

    fun onListEntered() {
        if (isLocked()) return
        listEntries++
        refreshList()
    }

    fun selectFilter(filter: RescueWarningV2Filter) {
        if (isLocked() || _listState.value.filter == filter) return

        listJob?.cancel()
        ++listVersion

        _listState.value = RescueWarningV2ListState(
            filter = filter,
            query = _listState.value.query
        )

        refreshList()
    }

    fun updateQuery(query: String) {
        if (isLocked() || _listState.value.query == query) return

        listJob?.cancel()
        ++listVersion

        _listState.value = RescueWarningV2ListState(
            filter = _listState.value.filter,
            query = query
        )

        refreshList()
    }

    fun refreshList() {
        if (isLocked()) return

        listJob?.cancel()
        val version = ++listVersion
        val epoch = accessEpoch

        val previous = _listState.value
        val requestedFilter = previous.filter
        val requestedQuery = previous.query

        _listState.value = previous.copy(
            isLoading = true,
            isStale = previous.hasLoaded,
            errorMessage = null
        )

        listJob = viewModelScope.launch {
            val result = repository.getWarnings(
                status = requestedFilter.apiStatus,
                query = requestedQuery
            )

            if (handleAccessFailure(result)) return@launch

            if (
                version != listVersion ||
                epoch != accessEpoch ||
                _listState.value.filter != requestedFilter ||
                _listState.value.query != requestedQuery ||
                isLocked()
            ) return@launch

            when (result) {
                is RescueWarningV2Result.Success -> {
                    _listState.value = _listState.value.copy(
                        warnings = result.data,
                        isLoading = false,
                        hasLoaded = true,
                        isStale = false,
                        errorMessage = null
                    )
                }

                is RescueWarningV2Result.Failure -> {
                    _listState.value = _listState.value.copy(
                        isLoading = false,
                        isStale = _listState.value.hasLoaded,
                        errorMessage = result.message
                    )
                }
            }
        }
    }

    fun openDetail(id: String, ownerKey: String) {
        if (isLocked() || ownerKey.isBlank()) return

        if (id.isBlank()) {
            _detailState.value = RescueWarningV2DetailState(
                errorMessage = "ID bản tin không hợp lệ."
            )
            return
        }

        val previous = _detailState.value

        // A recomposition of the same entry must not refetch.
        if (previous.id == id && previous.ownerKey == ownerKey) {
            return
        }

        detailJob?.cancel()
        ++detailVersion

        _detailState.value = RescueWarningV2DetailState(
            id = id,
            ownerKey = ownerKey
        )

        refreshDetail(expectedOwner = ownerKey)
    }

    fun refreshDetail(expectedOwner: String? = null) {
        if (isLocked()) return

        val current = _detailState.value
        val id = current.id ?: return
        val owner = current.ownerKey ?: return

        if (expectedOwner != null && expectedOwner != owner) {
            return
        }

        detailJob?.cancel()
        val version = ++detailVersion
        val epoch = accessEpoch

        _detailState.value = current.copy(
            isLoading = true,
            isStale = current.warning != null,
            notFound = false,
            errorMessage = null
        )

        detailJob = viewModelScope.launch {
            val result = repository.getDetail(id)

            if (handleAccessFailure(result)) return@launch

            val latest = _detailState.value

            if (
                version != detailVersion ||
                epoch != accessEpoch ||
                latest.id != id ||
                latest.ownerKey != owner ||
                isLocked()
            ) return@launch

            when (result) {
                is RescueWarningV2Result.Success -> {
                    _detailState.value = latest.copy(
                        warning = result.data,
                        isLoading = false,
                        hasLoaded = true,
                        isStale = false,
                        notFound = false,
                        errorMessage = null
                    )
                }

                is RescueWarningV2Result.Failure -> {
                    val notFound =
                        result.kind == RescueWarningV2FailureKind.NOT_FOUND

                    _detailState.value = latest.copy(
                        warning = if (notFound) null else latest.warning,
                        isLoading = false,
                        hasLoaded = !notFound && latest.hasLoaded,
                        isStale = !notFound && latest.warning != null,
                        notFound = notFound,
                        errorMessage = result.message
                    )
                }
            }
        }
    }

    fun closeDetail(
        expectedOwner: String,
        expectedId: String? = null
    ) {
        val current = _detailState.value

        if (current.ownerKey != expectedOwner) return
        if (expectedId != null && current.id != expectedId) return

        detailJob?.cancel()
        ++detailVersion
        _detailState.value = RescueWarningV2DetailState()
    }

    fun onMapEntered() {
        if (isLocked()) return
        refreshZones()
    }

    fun refreshZones() {
        if (isLocked()) return

        mapJob?.cancel()
        val version = ++mapVersion
        val epoch = accessEpoch

        val previous = _mapState.value
        _mapState.value = previous.copy(
            isLoading = true,
            isStale = previous.hasLoaded,
            errorMessage = null
        )

        mapJob = viewModelScope.launch {
            val result = zonesRepository.getZones()

            if (handleAccessFailure(result)) return@launch

            if (
                version != mapVersion ||
                epoch != accessEpoch ||
                isLocked()
            ) return@launch

            when (result) {
                is RescueWarningV2Result.Success -> {
                    _mapState.value = RescueWarningV2MapState(
                        snapshot = result.data,
                        hasLoaded = true
                    )
                }

                is RescueWarningV2Result.Failure -> {
                    _mapState.value = _mapState.value.copy(
                        isLoading = false,
                        isStale = _mapState.value.hasLoaded,
                        errorMessage = result.message
                    )
                }
            }
        }
    }

    private fun isLocked(): Boolean = _accessFailure.value != null

    private fun handleAccessFailure(
        result: RescueWarningV2Result<*>
    ): Boolean {
        if (result !is RescueWarningV2Result.Failure) return false

        if (
            result.kind != RescueWarningV2FailureKind.UNAUTHORIZED &&
            result.kind != RescueWarningV2FailureKind.FORBIDDEN
        ) return false

        lockAccess(result.kind)
        return true
    }

    private fun lockAccess(kind: RescueWarningV2FailureKind) {
        if (isLocked()) return

        _accessFailure.value = kind
        ++accessEpoch

        overviewJob?.cancel()
        listJob?.cancel()
        detailJob?.cancel()
        mapJob?.cancel()

        ++overviewVersion
        ++listVersion
        ++detailVersion
        ++mapVersion

        // Do not retain any previous account data after access is blocked.
        _overviewState.value = RescueWarningV2OverviewState(
            errorMessage = "Không thể tiếp tục truy cập cảnh báo."
        )

        _listState.value = RescueWarningV2ListState(
            filter = _listState.value.filter,
            query = _listState.value.query,
            errorMessage = "Không thể tiếp tục truy cập cảnh báo."
        )

        _detailState.value = RescueWarningV2DetailState(
            errorMessage = "Không thể tiếp tục truy cập cảnh báo."
        )

        _mapState.value = RescueWarningV2MapState(
            errorMessage = "Không thể tiếp tục truy cập cảnh báo."
        )
    }

    override fun onCleared() {
        overviewJob?.cancel()
        listJob?.cancel()
        detailJob?.cancel()
        mapJob?.cancel()
        super.onCleared()
    }
}
