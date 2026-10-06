package com.example.floodguard.ui.screens.map

data class FloodMapUiState(
    val title: String = "Bản đồ ngập & vị trí",
    val realtimeStatus: String = "TRỰC TUYẾN • GIS REAL-TIME",

    val currentLocation: String = "Hòa Khương, Hòa Vang, Đà Nẵng",
    val gpsAccuracy: String = "GPS ±3m (Galileo)",
    val updateTime: String = "17:42 • 3p/lần",
    val satelliteInfo: String = "VỆ TINH K5",

    val monitoredArea: String = "XÃ HÒA KHƯƠNG",
    val monitoredSubArea: String = "XÓM 3, THÔN PHÚ SƠN",
    val alertLevel: String = "CẢNH BÁO CẤP II",

    val expectedFloodDepth: String = "0.45 m",
    val expectedFloodTrend: String = "+3cm/giờ",

    val riverName: String = "Sông Vu Gia",
    val riverLevel: String = "7.82 m",
    val riverLevelNote: String = "BĐ2 (+0.32m)",

    val nearestShelterDistance: String = "650 m",
    val nearestShelterNote: String = "~8p đi bộ đê",

    val shelterName: String = "THCS Trần Phú",
    val shelterCapacity: String = "Còn 140 chỗ",
    val shelterDescription: String =
        "Có máy phát điện độc lập, lương thực 72h & trạm y tế cơ động. " +
                "Tuyến đê Hòa Khương hiện khô ráo, an toàn cho xe máy và đi bộ.",

    val safeRouteLabel: String = "Tuyến đê an toàn (khô ráo)",
    val floodedAreaLabel: String = "NGẬP 0.8 - 1.4m",
    val overflowLabel: String = "TRÀN BỜ 0.4m",
    val riverMarkerLabel: String = "Ái Nghĩa: 7.82m",
    val userMarkerLabel: String = "Bạn đang ở đây",
    val shelterMarkerLabel: String = "THCS Trần Phú (650m)",

    val isFloodLayerEnabled: Boolean = true,
    val isUserLayerEnabled: Boolean = true,
    val isShelterLayerEnabled: Boolean = true,
    val isSafeRouteLayerEnabled: Boolean = true
)