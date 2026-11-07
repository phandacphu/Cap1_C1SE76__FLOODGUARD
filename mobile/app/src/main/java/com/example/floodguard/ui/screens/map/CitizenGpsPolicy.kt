package com.example.floodguard.ui.screens.map

internal const val CITIZEN_GPS_TIMEOUT_MILLIS = 15_000L

internal fun isCitizenGpsFixUsable(
    latitude: Double,
    longitude: Double,
    fixNanos: Long,
    sessionStartNanos: Long,
    nowNanos: Long
): Boolean {
    return latitude.isFinite() &&
            longitude.isFinite() &&
            latitude in -90.0..90.0 &&
            longitude in -180.0..180.0 &&
            fixNanos > 0L &&
            sessionStartNanos >= 0L &&
            fixNanos >= sessionStartNanos &&
            fixNanos <= nowNanos &&
            nowNanos - fixNanos <
            CITIZEN_GPS_TIMEOUT_MILLIS * 1_000_000L
}