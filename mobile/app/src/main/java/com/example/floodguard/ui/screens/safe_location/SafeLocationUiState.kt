package com.example.floodguard.ui.screens.safe_location

import com.example.floodguard.domain.model.SafeLocation

enum class SafeLocationFilter {
    ALL,
    NEAREST,
    AVAILABLE,
    MEDICAL
}

data class SafeLocationUiState(
    val isLoading: Boolean = false,
    val locations: List<SafeLocation> = emptyList(),
    val selectedFilter: SafeLocationFilter = SafeLocationFilter.ALL,
    val errorMessage: String? = null,

    // Thông tin GPS
    val currentAddress: String = "Chưa xác định vị trí",
    val latitude: Double? = null,
    val longitude: Double? = null,
    val gpsAccuracyMeters: Float? = null,
    val lastUpdated: String? = null
)