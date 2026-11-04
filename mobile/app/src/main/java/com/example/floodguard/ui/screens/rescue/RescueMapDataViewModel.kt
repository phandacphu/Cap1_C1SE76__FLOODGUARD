package com.example.floodguard.ui.screens.rescue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.model.FloodAlertDto
import com.example.floodguard.data.model.FloodAreaDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal sealed interface RescueMapLoadState<out T> {
    data object Loading : RescueMapLoadState<Nothing>
    data object Empty : RescueMapLoadState<Nothing>
    data class Data<T>(val items: List<T>) : RescueMapLoadState<T>
    data class Error(val message: String) : RescueMapLoadState<Nothing>
}

internal data class RescueMapDataUiState(
    val floodAreas: RescueMapLoadState<FloodAreaDto> = RescueMapLoadState.Loading,
    val activeWarnings: RescueMapLoadState<FloodAlertDto> = RescueMapLoadState.Loading
) {
    val isLoading: Boolean
        get() = floodAreas is RescueMapLoadState.Loading || activeWarnings is RescueMapLoadState.Loading
}

/** The existing repositories are supplied by the map's ViewModel initializer.
 * Initial requests run once per ViewModel; GPS/camera changes never trigger a refresh.
 */
internal class RescueMapDataViewModel(
    private val loadFloodAreas: suspend () -> Result<List<FloodAreaDto>>,
    private val loadActiveWarnings: suspend () -> Result<List<FloodAlertDto>>
) : ViewModel() {
    private val _uiState = MutableStateFlow(RescueMapDataUiState())
    val uiState = _uiState.asStateFlow()
    private var areaJob: Job? = null
    private var warningJob: Job? = null

    init {
        refresh()
    }

    fun refresh() {
        if (areaJob?.isActive == true || warningJob?.isActive == true) return
        retryFloodAreas()
        retryActiveWarnings()
    }

    fun retryFloodAreas() {
        if (areaJob?.isActive == true) return
        areaJob = viewModelScope.launch {
            _uiState.update { it.copy(floodAreas = RescueMapLoadState.Loading) }
            val result = loadLayer(loadFloodAreas, "Không tải được vùng ngập. Kiểm tra kết nối rồi thử lại.")
            _uiState.update { it.copy(floodAreas = result) }
        }
    }

    fun retryActiveWarnings() {
        if (warningJob?.isActive == true) return
        warningJob = viewModelScope.launch {
            _uiState.update { it.copy(activeWarnings = RescueMapLoadState.Loading) }
            val result = loadLayer(loadActiveWarnings, "Không tải được cảnh báo. Kiểm tra kết nối rồi thử lại.")
            _uiState.update { it.copy(activeWarnings = result) }
        }
    }

    private suspend fun <T> loadLayer(
        load: suspend () -> Result<List<T>>,
        errorMessage: String
    ): RescueMapLoadState<T> = try {
        val items = load().getOrThrow().toList()
        if (items.isEmpty()) RescueMapLoadState.Empty else RescueMapLoadState.Data(items)
    } catch (error: CancellationException) {
        throw error
    } catch (_: Exception) {
        RescueMapLoadState.Error(errorMessage)
    }
}
