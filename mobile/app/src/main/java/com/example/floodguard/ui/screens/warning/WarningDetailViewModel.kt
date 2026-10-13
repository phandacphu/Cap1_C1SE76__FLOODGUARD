package com.example.floodguard.ui.screens.warning

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.FloodAlertRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WarningDetailUiState(
    val isLoading: Boolean = false,
    val warningDetail: WarningDetail? = null,
    val errorMessage: String? = null
)

class WarningDetailViewModel(
    savedStateHandle: SavedStateHandle,
    private val floodAlertRepository: FloodAlertRepository
) : ViewModel() {

    private val warningId: String =
        savedStateHandle["warningId"] ?: ""

    private val _uiState =
        MutableStateFlow(
            WarningDetailUiState(
                isLoading = true
            )
        )

    val uiState: StateFlow<WarningDetailUiState> =
        _uiState.asStateFlow()

    init {
        loadWarningDetail()
    }

    fun loadWarningDetail() {

        viewModelScope.launch {

            _uiState.value =
                WarningDetailUiState(
                    isLoading = true
                )

            val result =
                floodAlertRepository.getFloodAlerts()

            result
                .onSuccess { floodAlerts ->

                    val alert =
                        floodAlerts.firstOrNull {
                            it.id == warningId
                        }

                    if (alert == null) {

                        _uiState.value =
                            WarningDetailUiState(
                                isLoading = false,
                                errorMessage =
                                    "Không tìm thấy cảnh báo"
                            )

                        return@onSuccess
                    }

                    val detail =
                        WarningDetail(
                            id = alert.id,

                            systemStatus =
                                if (
                                    alert.status.equals(
                                        "active",
                                        ignoreCase = true
                                    )
                                ) {
                                    "CẢNH BÁO ĐANG HOẠT ĐỘNG"
                                } else {
                                    "CẢNH BÁO KHÔNG HOẠT ĐỘNG"
                                },

                            screenTitle = "Chi tiết cảnh báo",

                            levelText =
                                alert.severity.uppercase(),

                            updatedTime =
                                alert.startAt,

                            updatedAgo = "",

                            bulletinNo =
                                alert.id,

                            headline =
                                alert.title,

                            locationSummary =
                                alert.areaId,

                            description =
                                alert.content,

                            keyAreas = "",
                            basinInfo = "",

                            peakWindow =
                                alert.endAt ?: "",

                            peakWindowNote = "",

                            rainfall6h = "",
                            rainfallNote = "",

                            currentWaterLevel = "",
                            currentWaterLevelNote = "",

                            spillDischarge = "",
                            spillDischargeNote = "",

                            floodDepthForecast = "",
                            floodDepthForecastNote = "",

                            riskyRoads = "",
                            floodedResidentialAreas = "",
                            riverbankLandslideRisk = "",

                            safetyGuides =
                                emptyList(),

                            emergencyNote = "",

                            sourceInfo =
                                "Dữ liệu từ FloodGuard Backend API"
                        )

                    _uiState.value =
                        WarningDetailUiState(
                            isLoading = false,
                            warningDetail = detail,
                            errorMessage = null
                        )
                }
                .onFailure { error ->

                    _uiState.value =
                        WarningDetailUiState(
                            isLoading = false,
                            errorMessage =
                                error.message
                                    ?: "Không thể tải chi tiết cảnh báo"
                        )
                }
        }
    }
}