package com.example.floodguard.data.model

data class FloodForecastResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val data: FloodForecastData? = null
)

data class FloodForecastData(
    val weather: WeatherForecastDto? = null,
    val flood: RiverForecastDto? = null
)

data class ForecastLocationDto(
    val latitude: Double? = null,
    val longitude: Double? = null,
    val timezone: String? = null
)

data class WeatherForecastDto(
    val source: String? = null,
    val requestedLocation: ForecastLocationDto? = null,
    val resolvedLocation: ForecastLocationDto? = null,
    val current: WeatherCurrentDto? = null,
    val hourly: List<WeatherHourlyDto>? = null,
    val units: WeatherForecastUnitsDto? = null,
    val disclaimer: String? = null
)

data class WeatherCurrentDto(
    val time: String? = null,
    val precipitation: Double? = null,
    val rain: Double? = null,
    val weatherCode: Int? = null
)

data class WeatherHourlyDto(
    val time: String? = null,
    val precipitationProbability: Double? = null,
    val precipitation: Double? = null,
    val rain: Double? = null
)

data class WeatherForecastUnitsDto(
    val current: Map<String, String>? = null,
    val hourly: Map<String, String>? = null
)

data class RiverForecastDto(
    val source: String? = null,
    val requestedLocation: ForecastLocationDto? = null,
    val resolvedLocation: ForecastLocationDto? = null,
    val dataAvailable: Boolean? = null,
    val message: String? = null,
    val daily: List<RiverDailyDto>? = null,
    val units: Map<String, String>? = null,
    val disclaimer: String? = null
)

data class RiverDailyDto(
    val date: String? = null,
    val riverDischarge: Double? = null,
    val riverDischargeMax: Double? = null
)