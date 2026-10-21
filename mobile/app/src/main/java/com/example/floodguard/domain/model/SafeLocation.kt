package com.example.floodguard.domain.model

enum class SafeLocationStatus {
    AVAILABLE,       // Còn chỗ
    LIMITED,         // Hạn chế tiếp nhận
    MEDICAL,         // Tiếp nhận y tế khẩn cấp
    FULL,            // Đã đầy / tạm ngừng tiếp nhận
    UNKNOWN          // Chưa xác định
}

enum class SafeLocationFacility {
    CLEAN_WATER,
    ELECTRICITY,
    MEDICAL,
    HOT_MEALS,
    GENERATOR,
    RESCUE_PICKUP,
    EMERGENCY_CARE,
    OXYGEN,
    DOCTOR,
    AMBULANCE
}

data class SafeLocation(
    val id: String,
    val name: String,
    val address: String,
    val description: String = "",

    // Vị trí địa lý
    val latitude: Double,
    val longitude: Double,

    // Khoảng cách và thời gian di chuyển (dữ liệu hiển thị tạm)
    val distanceMeters: Int? = null,
    val travelMinutes: Int? = null,

    // Sức chứa
    val capacity: Int,
    val currentOccupancy: Int,

    // Trạng thái
    val status: SafeLocationStatus,
    val statusDescription: String = "",

    // Tiện ích
    val facilities: List<SafeLocationFacility> = emptyList(),

    // Thông tin hỗ trợ
    val safetyNote: String = "",
    val isRouteSafe: Boolean = true
) {
    val availableSlots: Int
        get() = (capacity - currentOccupancy).coerceAtLeast(0)

    val occupancyProgress: Float
        get() = if (capacity > 0) {
            (currentOccupancy.toFloat() / capacity)
                .coerceIn(0f, 1f)
        } else {
            0f
        }

    val isAcceptingPeople: Boolean
        get() = status == SafeLocationStatus.AVAILABLE ||
                status == SafeLocationStatus.LIMITED ||
                status == SafeLocationStatus.MEDICAL
}