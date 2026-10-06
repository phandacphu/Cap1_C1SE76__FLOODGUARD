package com.example.floodguard.ui.screens.warning

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class WarningDetailUiState(
    val isLoading: Boolean = false,
    val warningDetail: WarningDetail? = null,
    val errorMessage: String? = null
)

class WarningDetailViewModel(
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val warningId: String =
        savedStateHandle["warningId"] ?: "warning_1"

    private val _uiState = MutableStateFlow(
        WarningDetailUiState(
            warningDetail = createFakeWarningDetail(warningId)
        )
    )

    val uiState: StateFlow<WarningDetailUiState> =
        _uiState.asStateFlow()
}

private fun createFakeWarningDetail(
    warningId: String
): WarningDetail {
    return WarningDetail(
        id = warningId,

        systemStatus = "HỆ THỐNG SẴN SÀNG • TRỰC TUYẾN",
        screenTitle = "Chi tiết cảnh báo",

        levelText = "BÁO ĐỘNG CẤP 3 • NGUY CẤP",

        updatedTime = "17:30",
        updatedAgo = "Cập nhật 15p trước",

        bulletinNo = "VN-DN-0924-FL3",

        headline =
            "LŨ QUÉT & NGẬP LỤT ĐẶC BIỆT LỚN HẠ DU SÔNG VU GIA - THU BỒN",

        locationSummary =
            "Huyện Hòa Vang (Đà Nẵng), Đại Lộc & Điện Bàn (Quảng Nam)",

        description =
            "Mực nước sông dâng rất nhanh do mưa lớn kết hợp hồ xả lũ. " +
                    "Nguy cơ ngập sâu diện rộng từ 1.2m - 2.5m tại vùng trũng thấp. " +
                    "Yêu cầu khẩn trương kích hoạt phương án ứng phó.",

        keyAreas =
            "Xã Hòa Khương, Hòa Tiến (Hòa Vang); " +
                    "TT. Ái Nghĩa, Đại Cường (Đại Lộc); " +
                    "Điện Hồng, Điện Tiến (Điện Bàn)",

        basinInfo =
            "Sông Vu Gia - Thu Bồn (Trạm Ái Nghĩa & Cẩm Lệ)",

        peakWindow = "18:30 - 23:00",

        peakWindowNote =
            "Duy trì cao 12-18h tiếp theo",

        rainfall6h = "185.4 mm",
        rainfallNote = "Thượng lưu mưa rất to",

        currentWaterLevel = "9.85 m",
        currentWaterLevelNote = "+0.85m trên BĐ3",

        spillDischarge = "1,850 m³/s",
        spillDischargeNote = "Sông Bung 4 & hồ chứa thượng nguồn",

        floodDepthForecast = "1.2 - 2.5 m",
        floodDepthForecastNote = "Vùng hạ lưu, bãi bồi và vùng trũng thấp",

        riskyRoads =
            "Quốc lộ 14B (Đại Cường), ĐT 605 " +
                    "(cầu Cẩm Lệ đi Hòa Tiến), ngập > 0.8m.",

        floodedResidentialAreas =
            "Quảng Lăng, Phú Hòa, Lạc Thành Nam, " +
                    "bãi bồi ven sông Yên và Quá Giáng.",

        riverbankLandslideRisk =
            "Sạt lở taluy âm ven sông Vu Gia đoạn Đại Lộc " +
                    "do dòng chảy xiết.",

        safetyGuides = listOf(
            "Kê cao tài sản, ngắt ngay nguồn điện tầng trệt.",
            "Di chuyển người già, trẻ nhỏ đến điểm tránh trú an toàn trước 19h00.",
            "Chuẩn bị nước uống, lương khô, sạc đầy pin và đèn pin.",
            "Tuyệt đối không lội qua dòng nước xiết, ngầm tràn."
        ),

        emergencyNote =
            "Nếu bị cô lập nguy hiểm: Bấm \"GỬI SOS\" hoặc gọi 114 / 112.",

        sourceInfo =
            "Nguồn: TT Dự báo KTTV Quốc gia & Cảm biến IoT Vu Gia - Thu Bồn " +
                    "• Cập nhật mỗi 10 phút • Hotline: 114 / 112"
    )
}