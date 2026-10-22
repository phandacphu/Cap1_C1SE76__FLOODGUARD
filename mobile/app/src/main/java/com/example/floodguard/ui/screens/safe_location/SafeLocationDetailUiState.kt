package com.example.floodguard.ui.screens.safe_location

import com.example.floodguard.domain.model.SafeLocation

data class SafeLocationDetailUiState(
    val isLoading: Boolean = false,

    // Thông tin địa điểm đang xem
    val location: SafeLocation? = null,

    // Thông báo lỗi khi không tìm thấy địa điểm
    val errorMessage: String? = null,

    // CCF-70 hiện sử dụng dữ liệu minh họa
    val isMockData: Boolean = true
)