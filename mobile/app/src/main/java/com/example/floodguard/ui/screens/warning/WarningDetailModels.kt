package com.example.floodguard.ui.screens.warning

data class WarningDetail(
    val id: String,

    val systemStatus: String,
    val screenTitle: String,

    val levelText: String,
    val updatedTime: String,
    val updatedAgo: String,

    val bulletinNo: String,
    val headline: String,

    val locationSummary: String,
    val description: String,

    val keyAreas: String,
    val basinInfo: String,

    val peakWindow: String,
    val peakWindowNote: String,

    val rainfall6h: String,
    val rainfallNote: String,

    val currentWaterLevel: String,
    val currentWaterLevelNote: String,

    val spillDischarge: String,
    val spillDischargeNote: String,

    val floodDepthForecast: String,
    val floodDepthForecastNote: String,

    val riskyRoads: String,
    val floodedResidentialAreas: String,
    val riverbankLandslideRisk: String,

    val safetyGuides: List<String>,

    val emergencyNote: String,

    val sourceInfo: String
)