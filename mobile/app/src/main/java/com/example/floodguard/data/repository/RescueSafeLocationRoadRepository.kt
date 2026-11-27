package com.example.floodguard.data.repository

import kotlinx.coroutines.CancellationException
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST
import java.util.Locale

data class SafeRoadPoint(
    val latitude: Double? = null,
    val longitude: Double? = null
)

data class SafeRoadRequest(
    val origin: SafeRoadPoint,
    val locationIds: List<String>
)

data class SafeRoadResult(
    val locationId: String? = null,
    val destination: SafeRoadPoint? = null,
    val distanceMeters: Long? = null
)

data class SafeRoadData(
    val provider: String? = null,
    val travelMode: String? = null,
    val results: List<SafeRoadResult?>? = null
)

data class SafeRoadResponse(
    val success: Boolean? = null,
    val data: SafeRoadData? = null
)

interface RescueSafeLocationRoadApi {

    @POST("api/rescue-route-distance/safe-locations/batch")
    suspend fun estimate(
        @Body request: SafeRoadRequest
    ): Response<SafeRoadResponse>
}

data class SafeRoadEstimate(
    val latitude: Double,
    val longitude: Double,
    val meters: Long?
) {
    fun matches(location: RescueCatalogLocation): Boolean =
        latitude == location.latitude &&
            longitude == location.longitude
}

class RescueSafeLocationRoadRepository(
    private val api: RescueSafeLocationRoadApi
) {
    private data class CacheKey(
        val gps: RescueCatalogGps,
        val destinations: List<Pair<String, SafeRoadPoint>>
    )

    private data class CacheEntry(
        val key: CacheKey,
        val values: Map<String, SafeRoadEstimate>,
        val storedAt: Long
    )

    private var cache: CacheEntry? = null

    suspend fun estimate(
        gps: RescueCatalogGps,
        locations: List<RescueCatalogLocation>
    ): Map<String, SafeRoadEstimate> {
        require(gps.isValid())

        if (locations.isEmpty()) return emptyMap()

        val ordered = locations.sortedBy { it.id }

        require(ordered.map { it.id }.distinct().size == ordered.size)

        val key = CacheKey(
            gps,
            ordered.map {
                it.id to SafeRoadPoint(it.latitude, it.longitude)
            }
        )

        cache?.let {
            if (
                it.key == key &&
                System.nanoTime() - it.storedAt <= 120_000_000_000L
            ) {
                return it.values
            }
        }

        val estimates = linkedMapOf<String, SafeRoadEstimate>()

        for (chunk in ordered.chunked(100)) {
            val requested = chunk.associateBy { it.id }

            val response = api.estimate(
                SafeRoadRequest(
                    origin = SafeRoadPoint(
                        gps.latitude,
                        gps.longitude
                    ),
                    locationIds = chunk.map { it.id }
                )
            )

            if (!response.isSuccessful) {
                throw IllegalStateException(
                    "Road Matrix HTTP ${response.code()}"
                )
            }

            val body = response.body()
            val data = body?.data

            require(
                body?.success == true &&
                    data?.provider == "openrouteservice" &&
                    data.travelMode == "DRIVE"
            )

            val rows = data?.results
                ?: error("Missing Matrix results")

            require(rows.size == requested.size)

            val seen = mutableSetOf<String>()

            for (row in rows) {
                val id = row?.locationId
                    ?: error("Missing location ID")

                val location = requested[id]
                    ?: error("Unexpected location ID")

                require(seen.add(id))

                val meters = row.distanceMeters
                require(meters == null || meters >= 0L)

                val point = row.destination

                val matches =
                    point?.latitude == location.latitude &&
                        point.longitude == location.longitude

                estimates[id] = SafeRoadEstimate(
                    latitude = location.latitude,
                    longitude = location.longitude,
                    meters = if (matches) meters else null
                )
            }

            require(seen.size == requested.size)
        }

        val result = estimates.toMap()

        cache = CacheEntry(
            key,
            result,
            System.nanoTime()
        )

        return result
    }
}

internal fun formatSafeRoadDistance(meters: Long?): String {
    if (meters == null || meters < 0L) {
        return "Chưa xác định"
    }

    val km = meters / 1000.0

    return String.format(
        Locale.forLanguageTag("vi-VN"),
        "%.1f km",
        km
    )
}