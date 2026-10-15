package com.example.floodguard.ui.screens.warning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.FloodAlertRepository
import com.example.floodguard.domain.model.Warning
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant

sealed class WarningUiState {

    data object Loading : WarningUiState()

    data object Empty : WarningUiState()

    data class Success(
        val warnings: List<Warning>
    ) : WarningUiState()

    data class Error(
        val message: String
    ) : WarningUiState()
}

class WarningViewModel(
    private val floodAlertRepository: FloodAlertRepository
) : ViewModel() {

    private val _uiState =
        MutableStateFlow<WarningUiState>(
            WarningUiState.Loading
        )

    val uiState: StateFlow<WarningUiState> =
        _uiState.asStateFlow()

    init {
        loadWarnings()
    }

    fun loadWarnings() {

        viewModelScope.launch {

            _uiState.value =
                WarningUiState.Loading

            val result =
                floodAlertRepository.getFloodAlerts()

            result
                .onSuccess { floodAlerts ->

                    val warnings =
                        floodAlerts.map { alert ->

                            Warning(
                                id = alert.id,
                                title = alert.title,
                                content = alert.content,
                                severity = alert.severity,
                                area = "Mã khu vực: ${alert.areaId}",
                                startTime = alert.startAt,
                                endTime = alert.endAt,
                                isEnabled =
                                    alert.status.equals(
                                        "active",
                                        ignoreCase = true
                                    ),

                                isEffectiveNow =
                                    isAlertEffectiveNow(
                                        status = alert.status,
                                        startAt = alert.startAt,
                                        endAt = alert.endAt
                                    )
                            )
                        }

                    _uiState.value =
                        if (warnings.isEmpty()) {

                            WarningUiState.Empty

                        } else {

                            WarningUiState.Success(
                                warnings = warnings
                            )
                        }
                }
                .onFailure { error ->

                    _uiState.value =
                        WarningUiState.Error(
                            message =
                                error.message
                                    ?: "Không thể tải danh sách cảnh báo"
                        )
                }
        }
    }

    fun retry() {
        loadWarnings()
    }
}

private fun isAlertEffectiveNow(
    status: String,
    startAt: String,
    endAt: String?
): Boolean {

    if (!status.equals("active", ignoreCase = true)) {
        return false
    }

    val now = Instant.now()

    val start =
        runCatching {
            Instant.parse(startAt)
        }.getOrNull()
            ?: return false

    val end =
        endAt
            ?.takeIf { it.isNotBlank() }
            ?.let {
                runCatching {
                    Instant.parse(it)
                }.getOrNull()
            }

    val hasStarted =
        !now.isBefore(start)

    val hasNotEnded =
        end == null || !now.isAfter(end)

    return hasStarted && hasNotEnded
}