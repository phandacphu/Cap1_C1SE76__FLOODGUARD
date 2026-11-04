package com.example.floodguard.ui.screens.rescue

internal const val RESCUE_GPS_TIMEOUT_MILLIS = 15_000L
internal const val RESCUE_GPS_MAX_AGE_MILLIS = 30_000L

internal enum class RescueGpsPermission {
    NOT_REQUESTED, DENIED, BLOCKED, APPROXIMATE, PRECISE;

    val isGranted: Boolean
        get() = this == APPROXIMATE || this == PRECISE
}

/** Rationale is false both before the first request and after permanent denial. */
internal fun rescueGpsPermission(
    hasFine: Boolean,
    hasCoarse: Boolean,
    hasRequestedBefore: Boolean,
    shouldShowRationale: Boolean
): RescueGpsPermission = when {
    hasFine -> RescueGpsPermission.PRECISE
    hasCoarse -> RescueGpsPermission.APPROXIMATE
    !hasRequestedBefore -> RescueGpsPermission.NOT_REQUESTED
    shouldShowRationale -> RescueGpsPermission.DENIED
    else -> RescueGpsPermission.BLOCKED
}

internal enum class RescueGpsFailure(val message: String, val actionLabel: String) {
    PERMISSION_REQUIRED(
        "Cần quyền vị trí để xác định vị trí cứu hộ. Bạn vẫn có thể xem bản đồ.",
        "Cấp quyền"
    ),
    PERMISSION_DENIED(
        "Bạn chưa cho phép truy cập vị trí. Có thể cấp quyền khi muốn dùng GPS; bản đồ vẫn sử dụng được.",
        "Cấp quyền"
    ),
    PERMISSION_BLOCKED(
        "Không thể hỏi lại quyền vị trí. Mở Cài đặt → Quyền → Vị trí để cho phép.",
        "Mở cài đặt"
    ),
    LOCATION_OFF(
        "Dịch vụ vị trí đang tắt. Bật vị trí của thiết bị rồi quay lại ứng dụng.",
        "Bật vị trí"
    ),
    TIMEOUT(
        "Chưa lấy được vị trí sau 15 giây. Hãy đến nơi thoáng hơn và thử lại GPS.",
        "Thử lại GPS"
    ),
    UNAVAILABLE(
        "Thiết bị chưa cung cấp được vị trí. Kiểm tra dịch vụ vị trí rồi thử lại; bạn vẫn có thể xem bản đồ.",
        "Thử lại GPS"
    ),
    INVALID_LOCATION(
        "Thiết bị trả về tọa độ không hợp lệ. Vui lòng thử lại GPS.",
        "Thử lại GPS"
    ),
    STALE_LOCATION(
        "Vị trí trả về đã cũ. Vui lòng thử lại để lấy vị trí mới.",
        "Thử lại GPS"
    )
}

/** A fix with invalid coordinates or a stale/unknown monotonic timestamp is unusable. */
internal fun rescueGpsFixFailure(
    latitude: Double,
    longitude: Double,
    capturedAtNanos: Long,
    nowNanos: Long
): RescueGpsFailure? = when {
    !latitude.isFinite() || !longitude.isFinite() ||
        latitude !in -90.0..90.0 || longitude !in -180.0..180.0 ->
        RescueGpsFailure.INVALID_LOCATION
    capturedAtNanos <= 0L || nowNanos < capturedAtNanos ||
        nowNanos - capturedAtNanos > RESCUE_GPS_MAX_AGE_MILLIS * 1_000_000L ->
        RescueGpsFailure.STALE_LOCATION
    else -> null
}
