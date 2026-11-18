package com.example.floodguard.data.mapper

import com.example.floodguard.data.model.SafeLocationDto
import com.example.floodguard.domain.model.SafeLocation
import com.example.floodguard.domain.model.SafeLocationStatus

fun SafeLocationDto.toDomain(): SafeLocation {
    require(location.latitude in -90.0..90.0 &&
            location.longitude in -180.0..180.0
    ) {
        "Tọa độ điểm tránh trú không hợp lệ"
    }

    return SafeLocation(
        id = id,
        name = name,
        address = address,
        type = type,
        distanceKm = distanceKm?.takeIf { it.isFinite() && it >= 0.0 },
        description = description.orEmpty(),
        latitude = location.latitude,
        longitude = location.longitude,
        distanceMeters = distanceKm
            ?.takeIf { it.isFinite() && it >= 0.0 }
            ?.let { (it * 1000).toInt() },
        travelMinutes = null,
        capacity = -1,
        currentOccupancy = 0,
        status = SafeLocationStatus.UNKNOWN,
        facilities = emptyList(),
        safetyNote = "",
        isRouteSafe = false,
        contacts = emptyList(),
        isVerified = false
    )
}