package com.example.floodguard.ui.screens.warning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.model.FloodAlertDto
import com.example.floodguard.data.repository.FloodAlertRepository
import com.example.floodguard.data.repository.FloodAreaRepository
import com.example.floodguard.domain.model.Warning
import com.example.floodguard.domain.model.WarningTimeStatus
import com.example.floodguard.domain.model.nextWarningStatusUpdateDelayMillis
import com.example.floodguard.domain.model.resolveWarningTimeStatus
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant

sealed class WarningUiState {
    data object Loading : WarningUiState()
    data object Empty : WarningUiState()
    data class Success(
        val warnings: List<Warning>,
        val areaLoadNotice: String? = null
    ) : WarningUiState()
    data class Error(val message: String) : WarningUiState()
}

class WarningViewModel(
    private val floodAlertRepository: FloodAlertRepository,
    private val floodAreaRepository: FloodAreaRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow<WarningUiState>(WarningUiState.Loading)
    val uiState: StateFlow<WarningUiState> = _uiState.asStateFlow()
    private var loadJob: Job? = null
    private var loadedAlerts: List<FloodAlertDto> = emptyList()

    init {
        loadWarnings()
    }

    fun loadWarnings() {
        if (loadJob?.isActive == true) return
        loadJob = viewModelScope.launch {
            _uiState.value = WarningUiState.Loading
            val areas = async { floodAreaRepository.getFloodAreas() }
            val alertsResult = floodAlertRepository.getFloodAlerts()
            val areasResult = if (areas.isCompleted) areas.await() else null
            alertsResult.onSuccess { alerts ->
                loadedAlerts = alerts
                val names = areasResult?.getOrNull().orEmpty()
                    .associate { it.id to it.name.trim() }
                val now = Instant.now()
                val warnings = alerts.map { alert ->
                    val timeStatus = resolveWarningTimeStatus(
                        alert.status, alert.startAt, alert.endAt, now
                    )
                    Warning(
                        id = alert.id,
                        title = alert.title,
                        content = alert.content,
                        severity = alert.severity,
                        area = names[alert.areaId]?.takeIf { it.isNotBlank() }
                            ?: "Khu vực chưa có tên",
                        startTime = alert.startAt,
                        endTime = alert.endAt,
                        isEnabled = alert.status.equals("active", ignoreCase = true),
                        isEffectiveNow = timeStatus == WarningTimeStatus.EFFECTIVE,
                        timeStatus = timeStatus
                    )
                }
                _uiState.value = if (warnings.isEmpty()) {
                    WarningUiState.Empty
                } else {
                    WarningUiState.Success(
                        warnings = warnings,
                        areaLoadNotice = when {
                            areasResult == null ->
                                "Đang tải tên khu vực."
                            areasResult.isFailure ->
                                "Chưa tải được tên khu vực. Bạn vẫn có thể xem cảnh báo; bấm Làm mới để thử lại."
                            alerts.any { names[it.areaId].isNullOrBlank() } ->
                                "Một số bản tin chưa có tên khu vực tương ứng."
                            else -> null
                        }
                    )
                }
            }.onFailure {
                _uiState.value = WarningUiState.Error(
                    "Không thể tải cảnh báo. Kiểm tra kết nối và thử lại."
                )
            }
            val state = _uiState.value as? WarningUiState.Success
            if (state == null) {
                areas.cancel()
                return@launch
            }

            val finalAreasResult = areas.await()
            val finalNames = finalAreasResult.getOrNull().orEmpty()
                .associate { it.id to it.name.trim() }

// Đọc trạng thái mới nhất để không ghi đè việc cập nhật
// trạng thái thời gian trong lúc chờ tên vùng.
            val current = _uiState.value as? WarningUiState.Success
                ?: return@launch
            val alertsById = loadedAlerts.associateBy { it.id }

            _uiState.value = current.copy(
                warnings = current.warnings.map { warning ->
                    val areaId = alertsById[warning.id]?.areaId
                    warning.copy(
                        area = finalNames[areaId]?.takeIf { it.isNotBlank() }
                            ?: "Khu vực chưa có tên"
                    )
                },
                areaLoadNotice = when {
                    finalAreasResult.isFailure ->
                        "Chưa tải được tên khu vực. Bạn vẫn có thể xem cảnh báo; bấm Làm mới để thử lại."
                    loadedAlerts.any { finalNames[it.areaId].isNullOrBlank() } ->
                        "Một số bản tin chưa có tên khu vực tương ứng."
                    else -> null
                }
            )
        }
    }

    /** Recalculate locally; this does not make a network request. */
    fun refreshTimeStatuses(): Long {
        val state = _uiState.value as? WarningUiState.Success ?: return 60_000L
        val now = Instant.now()
        val alertsById = loadedAlerts.associateBy { it.id }
        val warnings = state.warnings.map { warning ->
            val alert = alertsById[warning.id] ?: return@map warning
            val status = resolveWarningTimeStatus(
                alert.status, alert.startAt, alert.endAt, now
            )
            warning.copy(
                timeStatus = status,
                isEffectiveNow = status == WarningTimeStatus.EFFECTIVE
            )
        }
        _uiState.value = state.copy(warnings = warnings)
        return warnings.minOfOrNull {
            nextWarningStatusUpdateDelayMillis(it.startTime, it.endTime, now)
        } ?: 60_000L
    }

    fun retry() = loadWarnings()
}
