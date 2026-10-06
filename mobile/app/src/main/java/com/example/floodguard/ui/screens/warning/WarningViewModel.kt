package com.example.floodguard.ui.screens.warning

import androidx.lifecycle.ViewModel
import com.example.floodguard.domain.model.Warning
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

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

class WarningViewModel : ViewModel() {

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

        // Mock data phục vụ phát triển giao diện.
        // Sau này thay bằng WarningRepository.

        val mockWarnings = listOf(

            Warning(
                id = "W001",
                title = "Lũ quét & Ngập lụt sâu diện rộng hạ lưu",
                content = "Nguy cơ ngập sâu tại một số khu vực thấp trũng. Người dân cần chủ động theo dõi cảnh báo và hướng dẫn sơ tán.",
                severity = "high",
                area = "Hòa Khương, Hòa Tiến - Hòa Vang",
                startTime = "17:30",
                endTime = "19:00",
                isActive = true,

                metricLeftLabel = "MỰC NƯỚC",
                metricLeftValue = "9.85 m",

                metricRightLabel = "LƯU LƯỢNG XẢ",
                metricRightValue = "1,250 m³/s",

                footerText = "ƯU TIÊN CỨU NẠN"
            ),

            Warning(
                id = "W002",
                title = "Ngập úng đô thị & Tắc nghẽn cục bộ",
                content = "Một số tuyến đường thấp trũng có nguy cơ xảy ra ngập cục bộ. Hạn chế di chuyển qua khu vực có nước dâng.",
                severity = "medium",
                area = "Cẩm Lệ & Liên Chiểu",
                startTime = "16:45",
                endTime = null,
                isActive = true,

                metricLeftLabel = "MƯA 3H",
                metricLeftValue = "60 mm",

                metricRightLabel = "NGẬP ƯỚC TÍNH",
                metricRightValue = "0.3 - 0.6 m",

                footerText = "NGẬP ĐIỂM GIAO THÔNG"
            ),

            Warning(
                id = "W003",
                title = "Theo dõi điều tiết lưu vực",
                content = "Người dân khu vực hạ lưu cần tiếp tục theo dõi thông tin cảnh báo và chủ động phương án an toàn.",
                severity = "low",
                area = "Hạ du lưu vực Vu Gia",
                startTime = "15:00",
                endTime = null,
                isActive = true,

                metricLeftLabel = "THÔNG SỐ MOCK",
                metricLeftValue = "600",

                metricRightLabel = "MỨC THAY ĐỔI",
                metricRightValue = "+0.3 - 0.5",

                footerText = "THEO DÕI CHỦ ĐỘNG"
            )
        )

        _uiState.value =
            if (mockWarnings.isEmpty()) {

                WarningUiState.Empty

            } else {

                WarningUiState.Success(
                    warnings = mockWarnings
                )
            }
    }

    fun retry() {

        _uiState.value =
            WarningUiState.Loading

        loadWarnings()
    }

    // Chỉ dùng khi test giao diện.
    fun showEmptyState() {

        _uiState.value =
            WarningUiState.Empty
    }

    // Chỉ dùng khi test giao diện.
    fun showErrorState() {

        _uiState.value =
            WarningUiState.Error(
                message = "Không thể tải danh sách cảnh báo."
            )
    }
}