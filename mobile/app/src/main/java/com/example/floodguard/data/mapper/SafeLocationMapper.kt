
package com.example.floodguard.data.mapper

import com.example.floodguard.data.model.SafeLocationDto
import com.example.floodguard.domain.model.SafeLocation
import com.example.floodguard.domain.model.SafeLocationContact
import com.example.floodguard.domain.model.SafeLocationFacility
import com.example.floodguard.domain.model.SafeLocationStatus

fun SafeLocationDto.toDomain(): SafeLocation {

    val mappedFacilities = services
        .filter { it.isAvailable }
        .mapNotNull { service ->
            val name = service.name.lowercase()

            when {
                "first_aid" in name ||
                        "medical" in name ||
                        "y tế" in name ->
                    SafeLocationFacility.MEDICAL

                "water" in name || "nước sạch" in name ->
                    SafeLocationFacility.CLEAN_WATER

                "electric" in name || "điện" in name ->
                    SafeLocationFacility.ELECTRICITY

                "food" in name || "suất ăn" in name ->
                    SafeLocationFacility.HOT_MEALS

                "generator" in name || "máy phát" in name ->
                    SafeLocationFacility.GENERATOR

                else -> null
            }
        }
        .distinct()

    return SafeLocation(
        id = id,
        name = name,
        address = address,
        description = description.orEmpty(),

        latitude = location.latitude,
        longitude = location.longitude,

        distanceMeters = distanceKm
            ?.takeIf { it.isFinite() && it >= 0.0 }
            ?.let { (it * 1000).toInt() },

        travelMinutes = null,

        capacity = capacity,

        // Backend chưa trả số người hiện tại.
        // Giá trị này chỉ là placeholder cho model cũ,
        // KHÔNG được sử dụng để hiển thị số chỗ còn lại.
        currentOccupancy = 0,

        status = SafeLocationStatus.UNKNOWN,
        statusDescription = when (status) {
            "active" ->
                "Đang được quản lý • Chưa xác minh chỗ trống"

            "inactive" ->
                "Địa điểm hiện không hoạt động"

            else ->
                "Chưa xác định trạng thái"
        },

        facilities = mappedFacilities,

        safetyNote = capacityNote.orEmpty(),
        isRouteSafe = false,

        contacts = contactPhone
            ?.takeIf { it.isNotBlank() }
            ?.let {
                listOf(
                    SafeLocationContact(
                        name = "Liên hệ điểm tránh trú",
                        phoneNumber = it
                    )
                )
            }
            ?: emptyList(),

        isVerified = false
    )
}
