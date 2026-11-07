package com.example.floodguard.ui.screens.home

import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.core.network.ApiClient
import com.example.floodguard.data.repository.FloodAlertRepository
import com.example.floodguard.data.repository.FloodForecastRepository
import com.example.floodguard.data.model.FloodForecastData
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class HydroMetric(
    val title: String,
    val value: String,
    val unit: String,
    val note: String
)

data class RegionalFloodInfo(
    val area: String,
    val level: String,
    val status: String
)

data class HomeUiState(
    val locationName: String = "Chưa xác định vị trí",
    val locationDetail: String = "Mở bản đồ để xem vị trí GPS",

    val alertLevel: String = "—",
    val alertStatus: String = "Chưa xác định",

    val warningTitle: String = "Chưa tải dữ liệu cảnh báo",
    val warningDescription: String = "",
    val warningTime: String = "",

    val isLoadingWarnings: Boolean = false,
    val warningError: String? = null,
    val hasActiveWarning: Boolean = false,

    val rainfall: HydroMetric = HydroMetric(
        "LƯỢNG MƯA", "—", "", "Chưa có dữ liệu"
    ),

    val riverLevel: HydroMetric = HydroMetric(
        "MỰC NƯỚC SÔNG", "—", "", "Chưa có dữ liệu"
    ),

    val wind: HydroMetric = HydroMetric(
        "GIÓ", "—", "", "Chưa có dữ liệu"
    ),

    val floodPoint: HydroMetric = HydroMetric(
        "ĐIỂM NGẬP", "—", "", "Chưa có dữ liệu"
    ),

    val shelterName: String = "Chưa chọn điểm tránh trú",
    val shelterAddress: String = "Xem danh sách điểm tránh trú",
    val shelterDistance: String = "",
    val shelterCapacity: String = "Chưa có dữ liệu",
    val shelterUtilities: String = "Chưa có dữ liệu",

    val forecastData: FloodForecastData? = null,
    val isLoadingForecast: Boolean = false,
    val forecastError: String? = null,
    val forecastLoadedAt: String? = null,
    val forecastLatitude: Double? = null,
    val forecastLongitude: Double? = null,

    val regionalFloodInfo: List<RegionalFloodInfo> = emptyList()
)

class HomeViewModel : ViewModel() {

    private val warningRepository = FloodAlertRepository(
        floodAlertApi = ApiClient.floodAlertApi
    )

    private val forecastRepository = FloodForecastRepository(
        forecastApi = ApiClient.floodForecastApi
    )

    // Các bản ghi thử nghiệm đã xác định ở phần bản đồ.
    private val excludedTestAreaIds = setOf(
        "ccf44-sample-flood-area-01",
        "TLpdPrxHD6D1pVECasus",
        "KzyV6q9mj5QkpxShKn3A"
    )

    private val _uiState = mutableStateOf(HomeUiState())

    val uiState: State<HomeUiState> = _uiState

    init {
        loadWarnings()
    }

    fun loadWarnings() {
        if (_uiState.value.isLoadingWarnings) return

        _uiState.value = _uiState.value.copy(
            isLoadingWarnings = true,
            warningError = null,
            hasActiveWarning = false,
            warningTitle = "Đang tải cảnh báo...",
            warningDescription = "",
            warningTime = ""
        )

        viewModelScope.launch {
            warningRepository.getActiveFloodAlerts()
                .onSuccess { alerts ->

                    val warning = alerts
                        .filter { alert ->
                            alert.areaId !in excludedTestAreaIds &&
                                    alert.status.equals(
                                        "active",
                                        ignoreCase = true
                                    )
                        }
                        .maxByOrNull { alert ->
                            severityRank(alert.severity)
                        }

                    val loadedAt = formatApiTime(
                        Instant.now().toString()
                    )

                    _uiState.value = _uiState.value.copy(
                        isLoadingWarnings = false,
                        warningError = null,
                        hasActiveWarning = warning != null,

                        warningTitle = warning?.let {
                            "${severityLabel(it.severity)} • ${it.title}"
                        } ?: "Chưa có cảnh báo đang hiệu lực",

                        warningDescription = warning?.let {
                            "${it.content}\n\n" +
                                    "Cảnh báo trên hệ thống; chưa đối chiếu " +
                                    "với vị trí của bạn."
                        } ?: (
                                "Hiện chưa có bản tin cảnh báo đang hiệu lực " +
                                        "được cung cấp. Đây không phải xác nhận " +
                                        "khu vực của bạn an toàn."
                                ),

                        warningTime = buildString {
                            append("Nguồn: FloodGuard API")
                            append("\nĐã tải: $loadedAt")

                            if (warning != null) {
                                append(
                                    "\nBắt đầu hiệu lực: " +
                                            formatApiTime(warning.startAt)
                                )

                                warning.endAt
                                    ?.takeIf { it.isNotBlank() }
                                    ?.let { endAt ->
                                        append(
                                            "\nKết thúc: " +
                                                    formatApiTime(endAt)
                                        )
                                    }
                            }
                        }
                    )
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(
                        isLoadingWarnings = false,
                        hasActiveWarning = false,
                        warningError = "Không thể tải dữ liệu cảnh báo.",
                        warningTitle = "Không tải được cảnh báo",
                        warningDescription = "Vui lòng thử tải lại dữ liệu.",
                        warningTime = ""
                    )
                }
        }
    }

    fun loadForecast(
        latitude: Double,
        longitude: Double
    ) {
        if (_uiState.value.isLoadingForecast) return

        _uiState.value = _uiState.value.copy(
            isLoadingForecast = true,
            forecastError = null,
            forecastData = null,
            forecastLoadedAt = null,
            forecastLatitude = null,
            forecastLongitude = null
        )

        viewModelScope.launch {
            forecastRepository.getForecast(
                latitude = latitude,
                longitude = longitude
            )
                .onSuccess { data ->
                    _uiState.value = _uiState.value.copy(
                        isLoadingForecast = false,
                        forecastError = null,
                        forecastData = data,
                        forecastLoadedAt = formatApiTime(
                            Instant.now().toString()
                        ),
                        forecastLatitude = latitude,
                        forecastLongitude = longitude
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoadingForecast = false,
                        forecastData = null,
                        forecastLoadedAt = null,
                        forecastLatitude = null,
                        forecastLongitude = null,
                        forecastError =
                            error.message?.takeIf { it.isNotBlank() }
                                ?: "Không thể tải dữ liệu dự báo."
                    )
                }
        }
    }

    private fun severityRank(value: String): Int =
        when (value.lowercase()) {
            "critical" -> 4
            "high" -> 3
            "medium" -> 2
            "low" -> 1
            else -> 0
        }

    private fun severityLabel(value: String): String =
        when (value.lowercase()) {
            "critical" -> "Nghiêm trọng"
            "high" -> "Cao"
            "medium" -> "Trung bình"
            "low" -> "Thấp"
            else -> "Chưa xác định mức độ"
        }

    private fun formatApiTime(value: String): String =
        runCatching {
            Instant.parse(value)
                .atZone(ZoneId.systemDefault())
                .format(
                    DateTimeFormatter.ofPattern(
                        "dd/MM/yyyy HH:mm"
                    )
                )
        }.getOrDefault("Chưa xác định")
}