package com.example.floodguard.ui.screens.home

import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel

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

    val locationName: String = "Xã Hòa Khương",
    val locationDetail: String = "Hòa Vang, Đà Nẵng",

    val alertLevel: String = "CẤP 2",
    val alertStatus: String = "NGUY HIỂM",

    val warningTitle: String =
        "CẢNH BÁO LŨ KHẨN CẤP",

    val warningDescription: String =
        "Mưa lớn kéo dài, mực nước sông đang tăng nhanh. " +
                "Người dân tại khu vực thấp trũng cần chủ động di chuyển đến nơi an toàn.",

    val warningTime: String =
        "Cập nhật lúc 20:20 • 05/10/2026",

    val rainfall: HydroMetric = HydroMetric(
        title = "LƯỢNG MƯA 24H",
        value = "128.4",
        unit = "mm",
        note = "Mưa rất lớn"
    ),

    val riverLevel: HydroMetric = HydroMetric(
        title = "SÔNG VU GIA",
        value = "7.82",
        unit = "m",
        note = "↑ 0.42 m"
    ),

    val wind: HydroMetric = HydroMetric(
        title = "GIÓ GIẬT MẠNH NHẤT",
        value = "42.5",
        unit = "km/h",
        note = "Hướng Đông Bắc"
    ),

    val floodPoint: HydroMetric = HydroMetric(
        title = "ĐIỂM NGẬP YẾU",
        value = "3/8",
        unit = "trạm",
        note = "Đang cảnh báo"
    ),

    val shelterName: String =
        "Trường THPT Ông Ích Khiêm",

    val shelterAddress: String =
        "Hòa Phong, Hòa Vang, Đà Nẵng",

    val shelterDistance: String =
        "2.3 km",

    val shelterCapacity: String =
        "420 / 800 người",

    val shelterUtilities: String =
        "Nước sạch • Y tế • Điện dự phòng",

    val regionalFloodInfo: List<RegionalFloodInfo> = listOf(

        RegionalFloodInfo(
            area = "Hòa Khương",
            level = "Cấp 2",
            status = "Nguy hiểm"
        ),

        RegionalFloodInfo(
            area = "Hòa Phong",
            level = "Cấp 1",
            status = "Cảnh giác"
        ),

        RegionalFloodInfo(
            area = "Hòa Nhơn",
            level = "Cấp 1",
            status = "Cảnh giác"
        ),

        RegionalFloodInfo(
            area = "Hòa Tiến",
            level = "Bình thường",
            status = "An toàn"
        )
    )
)

class HomeViewModel : ViewModel() {

    private val _uiState = mutableStateOf(
        HomeUiState()
    )

    val uiState: State<HomeUiState> = _uiState
}