package com.example.floodguard.ui.screens.warning

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.FloodAlertRepository
import com.example.floodguard.data.repository.FloodAreaRepository
import com.example.floodguard.data.model.FloodAlertDto
import com.example.floodguard.domain.model.formatWarningDateTime
import com.example.floodguard.domain.model.nextWarningStatusUpdateDelayMillis
import com.example.floodguard.domain.model.resolveWarningTimeStatus
import com.example.floodguard.domain.model.warningSeverityLabel
import com.example.floodguard.domain.model.warningTimeStatusLabel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
data class WarningDetailUiState(
    val isLoading: Boolean = false,
    val warningDetail: WarningDetail? = null,
    val errorMessage: String? = null,
    val areaLoadNotice: String? = null
)

class WarningDetailViewModel(
    savedStateHandle: SavedStateHandle,
    private val floodAlertRepository: FloodAlertRepository,
    private val floodAreaRepository: FloodAreaRepository
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

    private var loadJob: Job? = null
    private var loadedAlert: FloodAlertDto? = null

    init {
        loadWarningDetail()
    }

    fun loadWarningDetail() {

        if (loadJob?.isActive == true) return
        loadJob = viewModelScope.launch {

            _uiState.value =
                WarningDetailUiState(
                    isLoading = true
                )

            if (warningId.isBlank()) {
                _uiState.value = WarningDetailUiState(errorMessage = "Không tìm thấy cảnh báo")
                return@launch
            }
            val areas = async { floodAreaRepository.getFloodAreas() }
            val result = floodAlertRepository.getFloodAlerts()
            val areasResult = if (areas.isCompleted) areas.await() else null
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

                    loadedAlert = alert
                    val areaName = areasResult?.getOrNull()
                        ?.firstOrNull { it.id == alert.areaId }
                        ?.name?.trim()?.takeIf { it.isNotBlank() }
                    val detail =
                        WarningDetail(
                            id = alert.id,

                            systemStatus = warningTimeStatusLabel(resolveWarningTimeStatus(
                                status = alert.status,
                                startAt = alert.startAt,
                                endAt = alert.endAt
                            )),

                            screenTitle = "Chi tiết cảnh báo",

                            levelText =
                                warningSeverityLabel(alert.severity),

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
                                areaName ?: "Khu vực chưa có tên",

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
                                "Nguồn: FloodGuard Backend API • Thời gian: giờ Việt Nam (GMT+7)"
                        )

                    _uiState.value =
                        WarningDetailUiState(
                            isLoading = false,
                            warningDetail = detail,
                            errorMessage = null,
                            areaLoadNotice = when {
                                areasResult == null ->
                                    "Đang tải tên khu vực."
                                areasResult.isFailure ->
                                    "Chưa tải được tên khu vực. Bấm làm mới để thử lại."
                                areaName == null ->
                                    "Chưa tìm thấy tên khu vực tương ứng với bản tin."
                                else -> null
                            }
                        )
                }
                .onFailure {

                    _uiState.value =
                        WarningDetailUiState(
                            isLoading = false,
                            errorMessage =
                                "Không thể tải chi tiết cảnh báo. Kiểm tra kết nối và thử lại."
                        )
                }
            if (_uiState.value.warningDetail == null) {
                areas.cancel()
                return@launch
            }

            val finalAreasResult = areas.await()
            val alert = loadedAlert ?: return@launch
            val current = _uiState.value
            val detail = current.warningDetail ?: return@launch

            val finalName = finalAreasResult.getOrNull()
                ?.firstOrNull { it.id == alert.areaId }
                ?.name?.trim()?.takeIf { it.isNotBlank() }

            _uiState.value = current.copy(
                warningDetail = detail.copy(
                    locationSummary = finalName ?: "Khu vực chưa có tên"
                ),
                areaLoadNotice = when {
                    finalAreasResult.isFailure ->
                        "Chưa tải được tên khu vực. Bấm làm mới để thử lại."
                    finalName == null ->
                        "Chưa tìm thấy tên khu vực tương ứng với bản tin."
                    else -> null
                }
            )
        }
    }

    fun refreshTimeStatus(): Long {
        val alert = loadedAlert ?: return 60_000L
        val state = _uiState.value
        val detail = state.warningDetail ?: return 60_000L
        val now = Instant.now()
        _uiState.value = state.copy(warningDetail = detail.copy(
            systemStatus = warningTimeStatusLabel(resolveWarningTimeStatus(
                alert.status, alert.startAt, alert.endAt, now
            ))
        ))
        return nextWarningStatusUpdateDelayMillis(alert.startAt, alert.endAt, now)
    }

}
