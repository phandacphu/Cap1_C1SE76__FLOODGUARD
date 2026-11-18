package com.example.floodguard.ui.screens.sos

import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.repository.ResidentSosApiException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.Instant

data class SosGpsSample(
    val latitude: Double,
    val longitude: Double,
    val capturedAtMillis: Long
)

data class ResidentSosUploadState(
    val sosId: String? = null,
    val isRunning: Boolean = false,
    val isUploading: Boolean = false,
    val lastServerRequest: RescueRequestDto? = null,
    val accessDenied: Boolean = false,
    val message: String? = null
)

class ResidentSosLocationUploader(
    private val scope: CoroutineScope,
    private val loadDetail:
    suspend (String) -> Result<RescueRequestDto>,
    private val captureLocation:
    suspend () -> SosGpsSample,
    private val uploadLocation:
    suspend (String, SosGpsSample) -> Result<RescueRequestDto>,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val intervalMillis: Long = 30_000L
) {
    private val _state = MutableStateFlow(ResidentSosUploadState())
    val state = _state.asStateFlow()

    private var job: Job? = null
    private var generation = 0L
    private val endedIds = mutableSetOf<String>()

    fun start(id: String) {
        if (id.isBlank() || _state.value.accessDenied) return
        if (id in endedIds) return

        if (
            job?.isActive == true &&
            _state.value.sosId == id
        ) {
            return
        }

        job?.cancel()
        val version = ++generation

        val old = _state.value
        _state.value = ResidentSosUploadState(
            sosId = id,
            isRunning = true,
            lastServerRequest = old.lastServerRequest
                ?.takeIf { it.id == id },
            message = "Đang kiểm tra trạng thái SOS."
        )

        job = scope.launch {
            while (isActive && isCurrent(id, version)) {
                val startedAt = nowMillis()

                try {
                    runCycle(id, version)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    if (isCurrent(id, version)) {
                        handleError(id, version, error)
                    }
                }

                if (!isCurrent(id, version)) break

                val elapsed = (nowMillis() - startedAt)
                    .coerceAtLeast(0L)

                delay(
                    (intervalMillis - elapsed)
                        .coerceAtLeast(1_000L)
                )
            }
        }
    }

    fun stop(clearData: Boolean = false) {
        generation++
        job?.cancel()
        job = null

        if (clearData) {
            endedIds.clear()
            _state.value = ResidentSosUploadState()
        } else {
            _state.value = _state.value.copy(
                isRunning = false,
                isUploading = false,
                message = "Đã tạm dừng cập nhật vị trí SOS."
            )
        }
    }

    // Chỉ truyền dữ liệu thực sự đọc được từ Backend vào đây.
    fun acceptServerRequest(request: RescueRequestDto) {
        val id = _state.value.sosId ?: return
        if (request.id != id) return

        // Không cho response active đến muộn làm sống lại SOS đã kết thúc.
        if (id in endedIds && request.state == "active") return

        val previous = _state.value.lastServerRequest
        val previousTime = parseTime(previous?.locationCapturedAt)
        val incomingTime = parseTime(request.locationCapturedAt)

        val merged = if (
            previousTime != null &&
            (incomingTime == null || incomingTime < previousTime)
        ) {
            request.copy(
                location = previous?.location,
                locationCapturedAt = previous?.locationCapturedAt,
                locationReceivedAt = previous?.locationReceivedAt
            )
        } else {
            request
        }

        _state.value = _state.value.copy(
            lastServerRequest = merged,
            isUploading = false
        )

        if (request.state != "active") {
            if (
                request.state == "rescued" ||
                request.state == "legacy_other"
            ) {
                endedIds.add(id)
            }

            halt(
                message = if (request.state == "rescued") {
                    "SOS đã được cứu. Đã dừng cập nhật vị trí."
                } else {
                    "SOS không có trạng thái hoạt động. Đã dừng cập nhật vị trí."
                }
            )
        }
    }

    private suspend fun runCycle(id: String, version: Long) {
        val initial = loadDetail(id).getOrThrow()
        if (!isCurrent(id, version)) return

        require(initial.id == id) {
            "Chi tiết trả về không khớp mã SOS."
        }

        acceptServerRequest(initial)
        if (!isCurrent(id, version)) return

        // Mẫu GPS chỉ nằm trong bộ nhớ, chưa thay vị trí đã đồng bộ.
        val sample = captureLocation()
        if (!isCurrent(id, version)) return
        requireFreshSample(sample)

        // Kiểm tra lại vì SOS có thể đã được cứu trong lúc lấy GPS.
        val latest = loadDetail(id).getOrThrow()
        if (!isCurrent(id, version)) return

        require(latest.id == id) {
            "Chi tiết trả về không khớp mã SOS."
        }

        acceptServerRequest(latest)
        if (!isCurrent(id, version)) return

        // Lượt đọc trạng thái có thể chậm.
        requireFreshSample(sample)

        val lastCaptured = parseTime(
            _state.value.lastServerRequest?.locationCapturedAt
        )

        if (
            lastCaptured != null &&
            sample.capturedAtMillis <= lastCaptured
        ) {
            _state.value = _state.value.copy(
                message = "Mẫu GPS đã cũ. Sẽ lấy mẫu mới."
            )
            return
        }

        _state.value = _state.value.copy(
            isUploading = true,
            message = "Đang đồng bộ vị trí SOS."
        )

        val updated = uploadLocation(id, sample).getOrThrow()
        if (!isCurrent(id, version)) return

        require(updated.id == id) {
            "Response cập nhật không khớp mã SOS."
        }

        acceptServerRequest(updated)

        if (isCurrent(id, version)) {
            _state.value = _state.value.copy(
                isUploading = false,
                message = "Vị trí đã được hệ thống ghi nhận."
            )
        }
    }

    private suspend fun handleError(
        id: String,
        version: Long,
        error: Exception
    ) {
        if (error is ResidentSosApiException) {
            if (error.statusCode in setOf(401, 403)) {
                halt(
                    message = error.message,
                    clearPrivateData = true,
                    accessDenied = true
                )
                return
            }

            if (error.statusCode == 404) {
                endedIds.add(id)
                halt(
                    message = error.message,
                    clearPrivateData = true
                )
                return
            }

            if (
                error.statusCode == 409 &&
                error.code == "SOS_NOT_ACTIVE"
            ) {
                // Đọc lại trạng thái nhưng tuyệt đối không PATCH thêm.
                val refreshed = try {
                    loadDetail(id)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Result.failure(failure)
                }

                if (!isCurrent(id, version)) return

                val refreshError = refreshed.exceptionOrNull()
                if (
                    refreshError is ResidentSosApiException &&
                    refreshError.statusCode in setOf(401, 403, 404)
                ) {
                    handleError(id, version, refreshError)
                    return
                }

                val request = refreshed.getOrNull()
                if (request?.id == id) {
                    acceptServerRequest(request)
                }

                endedIds.add(id)

                if (isCurrent(id, version)) {
                    halt(
                        "SOS không còn hoạt động. " +
                                "Đã dừng cập nhật vị trí; hãy làm mới trạng thái."
                    )
                }
                return
            }
        }

        // STALE_SOS_LOCATION, lỗi thời gian, GPS, mạng và 5xx:
        // giữ vị trí Backend đã xác nhận; vòng sau lấy mẫu mới.
        _state.value = _state.value.copy(
            isUploading = false,
            message = error.message
                ?: "Chưa đồng bộ được vị trí. Sẽ thử bằng mẫu GPS mới."
        )
    }

    private fun requireFreshSample(sample: SosGpsSample) {
        require(
            sample.latitude.isFinite() &&
                    sample.longitude.isFinite() &&
                    sample.latitude in -90.0..90.0 &&
                    sample.longitude in -180.0..180.0 &&
                    sample.capturedAtMillis > 0 &&
                    nowMillis() - sample.capturedAtMillis in 0L..30_000L
        ) {
            "Mẫu GPS không hợp lệ hoặc đã cũ. Cần lấy mẫu mới."
        }
    }

    private fun isCurrent(id: String, version: Long): Boolean =
        version == generation &&
                _state.value.sosId == id &&
                _state.value.isRunning

    fun rejectAccess(message: String?) {
        halt(
            message = message ?: "Phiên đăng nhập hoặc quyền truy cập không hợp lệ.",
            clearPrivateData = true,
            accessDenied = true
        )
    }

    private fun halt(
        message: String?,
        clearPrivateData: Boolean = false,
        accessDenied: Boolean = false
    ) {
        generation++
        job?.cancel()
        job = null

        _state.value = if (clearPrivateData) {
            ResidentSosUploadState(
                accessDenied = accessDenied,
                message = message
            )
        } else {
            _state.value.copy(
                isRunning = false,
                isUploading = false,
                message = message
            )
        }
    }

    private fun parseTime(value: String?): Long? =
        try {
            value?.let { Instant.parse(it).toEpochMilli() }
        } catch (_: Exception) {
            null
        }
}