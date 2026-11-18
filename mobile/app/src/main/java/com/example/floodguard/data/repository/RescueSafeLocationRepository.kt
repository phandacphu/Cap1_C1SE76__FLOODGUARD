package com.example.floodguard.data.repository

import com.example.floodguard.data.model.RescueSafeLocationDto
import com.example.floodguard.data.remote.api.RescueSafeLocationApi
import java.io.IOException
import kotlinx.coroutines.CancellationException

data class RescueCatalogGps(
    val latitude: Double,
    val longitude: Double
) {
    fun isValid(): Boolean =
        latitude.isFinite() && longitude.isFinite() &&
            latitude in -90.0..90.0 &&
            longitude in -180.0..180.0
}

data class RescueCatalogLocation(
    val id: String,
    val name: String,
    val address: String,
    val latitude: Double,
    val longitude: Double,
    val type: String,
    val description: String?,
    val distanceKm: Double?
)

enum class RescueCatalogFailureKind {
    INVALID_GPS,
    INVALID_ID,
    BAD_REQUEST,
    NOT_FOUND,
    UNAUTHORIZED,
    FORBIDDEN,
    SERVER,
    NETWORK,
    INVALID_RESPONSE,
    HTTP
}

sealed class RescueCatalogResult<out T> {
    data class Success<T>(val data: T) : RescueCatalogResult<T>()

    data class Failure(
        val kind: RescueCatalogFailureKind,
        val message: String
    ) : RescueCatalogResult<Nothing>()
}

class RescueSafeLocationRepository(
    private val api: RescueSafeLocationApi
) {
    suspend fun getLocations(
        gps: RescueCatalogGps? = null
    ): RescueCatalogResult<List<RescueCatalogLocation>> {
        if (gps != null && !gps.isValid()) {
            return failure(
                RescueCatalogFailureKind.INVALID_GPS,
                "Tọa độ hiện tại không hợp lệ."
            )
        }

        return safely {
            val response = api.getSafeLocations(
                latitude = gps?.latitude,
                longitude = gps?.longitude
            )

            if (!response.isSuccessful) {
                return@safely httpFailure(response.code())
            }

            val body = response.body()
            if (body?.success != true) {
                return@safely invalidResponse()
            }

            val items = body.data?.safeLocations
                ?: return@safely invalidResponse()

            val locations = mutableListOf<RescueCatalogLocation>()

            for (dto in items) {
                val location = dto.toCatalogLocation(
                    includeDistance = gps != null
                ) ?: return@safely invalidResponse()

                locations.add(location)
            }

            RescueCatalogResult.Success(locations.toList())
        }
    }

    suspend fun getDetail(
        id: String,
        gps: RescueCatalogGps? = null
    ): RescueCatalogResult<RescueCatalogLocation> {
        if (id.isBlank()) {
            return failure(
                RescueCatalogFailureKind.INVALID_ID,
                "ID địa điểm không hợp lệ."
            )
        }

        if (gps != null && !gps.isValid()) {
            return failure(
                RescueCatalogFailureKind.INVALID_GPS,
                "Tọa độ hiện tại không hợp lệ."
            )
        }

        return safely {
            val response = api.getSafeLocationDetail(
                id = id,
                latitude = gps?.latitude,
                longitude = gps?.longitude
            )

            if (!response.isSuccessful) {
                return@safely httpFailure(
                    response.code(),
                    isDetail = true
                )
            }

            val body = response.body()
            if (body?.success != true) {
                return@safely invalidResponse()
            }

            val location = body.data?.safeLocation
                .toCatalogLocation(includeDistance = gps != null)
                ?: return@safely invalidResponse()

            if (location.id != id) {
                return@safely invalidResponse()
            }

            RescueCatalogResult.Success(location)
        }
    }

    private suspend fun <T> safely(
        block: suspend () -> RescueCatalogResult<T>
    ): RescueCatalogResult<T> {
        return try {
            block()
        } catch (error: CancellationException) {
            throw error
        } catch (error: IOException) {
            failure(
                RescueCatalogFailureKind.NETWORK,
                "Không thể kết nối máy chủ. Vui lòng thử lại."
            )
        } catch (error: Exception) {
            invalidResponse()
        }
    }

    private fun httpFailure(
        status: Int,
        isDetail: Boolean = false
    ): RescueCatalogResult.Failure = when (status) {
        400 -> failure(
            RescueCatalogFailureKind.BAD_REQUEST,
            "Yêu cầu điểm tránh trú không hợp lệ."
        )
        401 -> failure(
            RescueCatalogFailureKind.UNAUTHORIZED,
            "Phiên đăng nhập không hợp lệ."
        )
        403 -> failure(
            RescueCatalogFailureKind.FORBIDDEN,
            "Bạn không có quyền truy cập."
        )
        404 -> failure(
            RescueCatalogFailureKind.NOT_FOUND,
            if (isDetail) {
                "Địa điểm không còn được cung cấp."
            } else {
                "Không tìm thấy API điểm tránh trú trên máy chủ."
            }
        )
        in 500..599 -> failure(
            RescueCatalogFailureKind.SERVER,
            "Máy chủ đang gặp sự cố. Vui lòng thử lại."
        )
        else -> failure(
            RescueCatalogFailureKind.HTTP,
            "Không thể tải dữ liệu (HTTP $status)."
        )
    }

    private fun invalidResponse() = failure(
        RescueCatalogFailureKind.INVALID_RESPONSE,
        "Dữ liệu điểm tránh trú từ máy chủ không hợp lệ."
    )

    private fun failure(
        kind: RescueCatalogFailureKind,
        message: String
    ) = RescueCatalogResult.Failure(kind, message)
}

private fun RescueSafeLocationDto?.toCatalogLocation(
    includeDistance: Boolean
): RescueCatalogLocation? {
    val dto = this ?: return null

    val id = dto.id?.trim()?.takeIf { it.isNotEmpty() }
        ?: return null
    val name = dto.name?.trim()?.takeIf { it.isNotEmpty() }
        ?: return null
    val address = dto.address?.trim()?.takeIf { it.isNotEmpty() }
        ?: return null

    val latitude = dto.location?.latitude ?: return null
    val longitude = dto.location?.longitude ?: return null

    if (!RescueCatalogGps(latitude, longitude).isValid()) {
        return null
    }

    val type = dto.type?.takeIf {
        it in setOf(
            "shelter",
            "school",
            "hospital",
            "community_center",
            "other"
        )
    } ?: return null

    val distance = dto.distanceKm
    if (distance != null &&
        (!distance.isFinite() || distance < 0.0)
    ) {
        return null
    }

    return RescueCatalogLocation(
        id = id,
        name = name,
        address = address,
        latitude = latitude,
        longitude = longitude,
        type = type,
        description = dto.description
            ?.trim()
            ?.takeIf { it.isNotEmpty() },
        distanceKm = if (includeDistance) distance else null
    )
}
