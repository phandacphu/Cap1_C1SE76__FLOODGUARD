package com.example.floodguard.ui.screens.safe_location

import androidx.lifecycle.ViewModel
import com.example.floodguard.domain.model.SafeLocation
import com.example.floodguard.domain.model.SafeLocationFacility
import com.example.floodguard.domain.model.SafeLocationStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class SafeLocationViewModel : ViewModel() {

    private val allLocations = createMockLocations()

    fun getLocationById(locationId: String): SafeLocation? {
        return allLocations.find { location ->
            location.id == locationId
        }
    }

    private val _uiState = MutableStateFlow(
        SafeLocationUiState(
            locations = allLocations
        )
    )

    val uiState: StateFlow<SafeLocationUiState> =
        _uiState.asStateFlow()

    fun selectFilter(filter: SafeLocationFilter) {
        _uiState.update { currentState ->
            currentState.copy(
                selectedFilter = filter,
                locations = filterLocations(filter)
            )
        }
    }

    private fun filterLocations(
        filter: SafeLocationFilter
    ): List<SafeLocation> {
        return when (filter) {

            SafeLocationFilter.ALL -> allLocations

            SafeLocationFilter.NEAREST -> {
                // Khoảng cách hiện là dữ liệu mẫu.
                allLocations.sortedBy {
                    it.distanceMeters ?: Int.MAX_VALUE
                }
            }

            SafeLocationFilter.AVAILABLE -> {
                allLocations.filter {
                    it.isAcceptingPeople &&
                            it.availableSlots > 0
                }
            }

            SafeLocationFilter.MEDICAL -> {
                allLocations.filter {
                    SafeLocationFacility.MEDICAL in it.facilities ||
                            SafeLocationFacility.EMERGENCY_CARE in it.facilities ||
                            SafeLocationFacility.DOCTOR in it.facilities
                }
            }
        }
    }

    private fun createMockLocations(): List<SafeLocation> {
        return listOf(
            SafeLocation(
                id = "safe_001",
                name = "Điểm tránh trú mẫu 01",
                address = "Địa chỉ minh họa 01",
                latitude = 0.0,
                longitude = 0.0,
                distanceMeters = 1200,
                travelMinutes = 5,
                capacity = 500,
                currentOccupancy = 180,
                status = SafeLocationStatus.AVAILABLE,
                statusDescription = "Còn chỗ",
                facilities = listOf(
                    SafeLocationFacility.CLEAN_WATER,
                    SafeLocationFacility.ELECTRICITY,
                    SafeLocationFacility.MEDICAL,
                    SafeLocationFacility.HOT_MEALS
                )
            ),

            SafeLocation(
                id = "safe_002",
                name = "Điểm tránh trú mẫu 02",
                address = "Địa chỉ minh họa 02",
                latitude = 0.0,
                longitude = 0.0,
                distanceMeters = 2500,
                travelMinutes = 10,
                capacity = 300,
                currentOccupancy = 270,
                status = SafeLocationStatus.LIMITED,
                statusDescription = "Sắp đầy",
                facilities = listOf(
                    SafeLocationFacility.CLEAN_WATER,
                    SafeLocationFacility.ELECTRICITY
                )
            ),

            SafeLocation(
                id = "safe_003",
                name = "Điểm hỗ trợ y tế mẫu 03",
                address = "Địa chỉ minh họa 03",
                latitude = 0.0,
                longitude = 0.0,
                distanceMeters = 3800,
                travelMinutes = 15,
                capacity = 200,
                currentOccupancy = 80,
                status = SafeLocationStatus.MEDICAL,
                statusDescription = "Hỗ trợ y tế",
                facilities = listOf(
                    SafeLocationFacility.MEDICAL,
                    SafeLocationFacility.EMERGENCY_CARE,
                    SafeLocationFacility.DOCTOR,
                    SafeLocationFacility.OXYGEN
                )
            ),

            SafeLocation(
                id = "safe_004",
                name = "Điểm tránh trú mẫu 04",
                address = "Địa chỉ minh họa 04",
                latitude = 0.0,
                longitude = 0.0,
                distanceMeters = 4200,
                travelMinutes = null,
                capacity = 400,
                currentOccupancy = 400,
                status = SafeLocationStatus.FULL,
                statusDescription = "Đã đầy",
                facilities = listOf(
                    SafeLocationFacility.CLEAN_WATER,
                    SafeLocationFacility.GENERATOR
                ),
                safetyNote = "Không tiếp nhận thêm người",
                isRouteSafe = false
            )
        )
    }
}