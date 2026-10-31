package com.example.floodguard.ui.screens.warning

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.FloodAlertRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
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

                            systemStatus = getWarningStatus(
                                status = alert.status,
                                startAt = alert.startAt,
                                endAt = alert.endAt
                            ),

                            screenTitle = "Chi tiết cảnh báo",

                            levelText =
                                alert.severity.uppercase(),

                            startTime =
                                formatWarningDateTime(
                                    alert.startAt
                                ),

                            endTime =
                                alert.endAt?.let {
                                    formatWarningDateTime(it)
                                },

                            bulletinNo =
                                alert.id,

                            headline =
                                alert.title,

                            locationSummary =
                                "Mã khu vực: ${alert.areaId}",

                            description =
                                alert.content,

                            keyAreas = "",
                            basinInfo = "",

                            peakWindow = "",
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

private fun formatWarningDateTime(
    isoTime: String
): String {

    return runCatching {

        Instant
            .parse(isoTime)
            .atZone(
                ZoneId.systemDefault()
            )
            .format(
                DateTimeFormatter
                    .ofPattern("dd/MM/yyyy HH:mm")
            )

    }.getOrDefault(isoTime)
}

private fun getWarningStatus(
    status: String,
    startAt: String,
    endAt: String?
): String {

    if (!status.equals("active", ignoreCase = true)) {
        return "CẢNH BÁO ĐÃ TẮT"
    }

    val now = Instant.now()

    val start = runCatching {
        Instant.parse(startAt)
    }.getOrNull()
        ?: return "KHÔNG XÁC ĐỊNH THỜI GIAN"

    val end = endAt
        ?.takeIf { it.isNotBlank() }
        ?.let {
            runCatching {
                Instant.parse(it)
            }.getOrNull()
                ?: return "KHÔNG XÁC ĐỊNH THỜI GIAN"
        }

    return when {
        end != null && !now.isBefore(end) -> {
            "CẢNH BÁO ĐÃ HẾT HẠN"
        }

        now.isBefore(start) -> {
            "CẢNH BÁO ĐANG BẬT • CHƯA CÓ HIỆU LỰC"
        }

        else -> {
            "CẢNH BÁO ĐANG CÓ HIỆU LỰC"
        }
    }
}