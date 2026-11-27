package com.example.floodguard.data.model

data class SosCachedLocation(
    val latitude: Double? = null,
    val longitude: Double? = null,
    val capturedAtMillis: Long? = null,
    val accuracyMeters: Float? = null
) {
    fun isValid(): Boolean {
        val lat = latitude
        val lon = longitude
        val time = capturedAtMillis

        return lat != null &&
                lon != null &&
                lat.isFinite() &&
                lon.isFinite() &&
                lat in -90.0..90.0 &&
                lon in -180.0..180.0 &&
                (time == null || time > 0L)
    }
}