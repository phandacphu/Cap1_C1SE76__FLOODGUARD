package com.example.floodguard.data.remote.dto.rescue.sos

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

// Separate from the existing Resident and Rescue SOS contracts.
internal interface RescueRouteDistanceApi {
    @POST("api/rescue-route-distance/batch")
    suspend fun estimateBatch(@Body request: RescueRouteMatrixRequest): Response<RescueRouteMatrixEnvelope>

    @POST("api/rescue-route-distance")
    suspend fun estimate(
        @Body request: RescueRouteDistanceRequest
    ): Response<RescueRouteDistanceEnvelope>
}

internal data class RescueRouteDistanceRequest(
    val requestId: String,
    val origin: SosPoint
)

internal data class RescueRouteDistanceEnvelope(
    val success: Boolean? = null,
    val data: RescueRouteDistanceData? = null
)

internal data class RescueRouteDistanceData(
    val requestId: String? = null,
    val distanceMeters: Int? = null,
    val destination: SosPoint? = null,
    val travelMode: String? = null,
    val provider: String? = null,
    val calculatedAt: String? = null
)

/** Matrix response is aligned by SOS ID, never by an assumed list index. */
internal data class RescueRouteMatrixRequest(
    val origin: SosPoint,
    val requestIds: List<String>
)

internal data class RescueRouteMatrixEnvelope(
    val success: Boolean? = null,
    val data: RescueRouteMatrixData? = null
)

internal data class RescueRouteMatrixData(
    val provider: String? = null,
    val travelMode: String? = null,
    val results: List<RescueRouteMatrixRow?>? = null
)

internal data class RescueRouteMatrixRow(
    val requestId: String? = null,
    val distanceMeters: Int? = null,
    // The coordinate actually used by the server-side Matrix calculation.
    // Null when SOS is missing or has no usable position.
    val destination: SosPoint? = null
)
