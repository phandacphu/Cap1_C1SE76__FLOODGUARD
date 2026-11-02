
package com.example.floodguard.data.model

import com.google.gson.JsonObject

data class FloodHistoryResponse(
    val success: Boolean = false,
    val message: String? = null,
    val data: FloodHistoryData? = null
)

data class FloodHistoryData(
    val layer: String? = null,
    val geojson: JsonObject? = null
)
