package com.example.floodguard.ui.screens.sos

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.example.floodguard.core.network.ApiClient
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.remote.api.ResidentSosApi
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.repository.ResidentSosApiException
import com.example.floodguard.data.repository.ResidentSosRepository
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.isActive
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull

private data class ResidentTrackingSession(
    val token: String? = null,
    val userId: String? = null,
    val role: String? = null
)

class ResidentSosTracking internal constructor(
    val uploader: ResidentSosLocationUploader,
    val discoveryError: StateFlow<String?>,
    private val wake: Channel<Unit>
) {
    fun refresh() {
        wake.trySend(Unit)
    }

    fun observe(request: RescueRequestDto) {
        uploader.acceptServerRequest(request)
        refresh()
    }

    fun onApiError(error: Throwable) {
        if (
            error is ResidentSosApiException &&
            error.statusCode in setOf(401, 403)
        ) {
            uploader.rejectAccess(error.message)
            refresh()
        }
    }

    fun retryLocation() {
        if (uploader.state.value.accessDenied) return
        uploader.stop()
        refresh()
    }
}

@Composable
fun rememberResidentSosTracking(
    sessionManager: SessionManager
): ResidentSosTracking {
    val context = LocalContext.current.applicationContext
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    val repository = remember(sessionManager) {
        ResidentSosRepository(
            ApiClient.createResidentSosRetrofit(sessionManager)
                .create(ResidentSosApi::class.java)
        )
    }

    val uploader = remember(repository, context, scope) {
        ResidentSosLocationUploader(
            scope = scope,
            loadDetail = repository::getDetail,
            captureLocation = {
                captureResidentSosLocation(context)
            },
            uploadLocation = { id, sample ->
                repository.updateLocation(
                    id = id,
                    latitude = sample.latitude,
                    longitude = sample.longitude,
                    capturedAtMillis = sample.capturedAtMillis
                )
            }
        )
    }

    val wake = remember { Channel<Unit>(Channel.CONFLATED) }
    val discoveryError = remember { MutableStateFlow<String?>(null) }

    val tracking = remember(uploader, wake, discoveryError) {
        ResidentSosTracking(uploader, discoveryError, wake)
    }

    val sessionFlow = remember(sessionManager) {
        combine(
            sessionManager.tokenFlow,
            sessionManager.userFlow
        ) { token, user ->
            ResidentTrackingSession(
                token = token,
                userId = user.id,
                role = user.role
            )
        }
    }

    val session by sessionFlow.collectAsState(
        initial = ResidentTrackingSession()
    )

    DisposableEffect(uploader) {
        onDispose {
            uploader.stop(clearData = true)
        }
    }

    LaunchedEffect(session, lifecycleOwner, repository) {
        uploader.stop(clearData = true)
        discoveryError.value = null

        if (
            session.token.isNullOrBlank() ||
            session.userId.isNullOrBlank() ||
            session.role != "resident"
        ) {
            return@LaunchedEffect
        }

        try {
            lifecycleOwner.lifecycle.repeatOnLifecycle(
                Lifecycle.State.STARTED
            ) {
                try {
                    while (currentCoroutineContext().isActive) {
                        if (uploader.state.value.accessDenied) break

                        try {
                            val activeRequests = repository.getActive()
                                .getOrThrow()

                            currentCoroutineContext().ensureActive()
                            if (uploader.state.value.accessDenied) break

                            require(
                                activeRequests.size <= 1 &&
                                        activeRequests.all {
                                            !it.id.isNullOrBlank() &&
                                                    it.state == "active" &&
                                                    it.residentId == session.userId
                                        }
                            ) {
                                "Chưa xác định được SOS hoạt động hợp lệ của tài khoản."
                            }

                            discoveryError.value = null
                            val active = activeRequests.singleOrNull()

                            if (active != null) {
                                uploader.start(requireNotNull(active.id))
                                uploader.acceptServerRequest(active)
                            } else {
                                val previous = uploader.state.value

                                if (
                                    previous.sosId != null &&
                                    (
                                            previous.isRunning ||
                                                    previous.lastServerRequest?.state == "active"
                                            )
                                ) {
                                    uploader.stop()

                                    val detail = repository.getDetail(
                                        previous.sosId
                                    ).getOrThrow()

                                    currentCoroutineContext().ensureActive()

                                    if (!uploader.state.value.accessDenied) {
                                        uploader.acceptServerRequest(detail)
                                    }
                                }
                            }
                        } catch (error: CancellationException) {
                            throw error
                        } catch (error: Exception) {
                            discoveryError.value = error.message
                                ?: "Chưa kiểm tra được SOS đang hoạt động."

                            tracking.onApiError(error)

                            if (uploader.state.value.accessDenied) break

                            if (error is IllegalArgumentException) {
                                // Dữ liệu hoạt động không hợp lệ:
                                // không tiếp tục dùng SOS cũ để gửi GPS.
                                uploader.stop(clearData = true)
                            }
                        }

                        withTimeoutOrNull(30_000L) {
                            wake.receive()
                        }
                    }
                } finally {
                    if (!uploader.state.value.accessDenied) {
                        uploader.stop()
                    }
                }
            }
        } finally {
            // Đổi tài khoản, đăng xuất hoặc rời thành phần ứng dụng.
            uploader.stop(clearData = true)
        }
    }

    return tracking
}

private fun hasResidentLocationPermission(context: Context): Boolean =
    listOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    ).any {
        ContextCompat.checkSelfPermission(
            context,
            it
        ) == PackageManager.PERMISSION_GRANTED
    }

@SuppressLint("MissingPermission")
private suspend fun captureResidentSosLocation(
    context: Context
): SosGpsSample {
    check(hasResidentLocationPermission(context)) {
        "Chưa có quyền vị trí. Hãy cấp quyền để đồng bộ GPS SOS."
    }

    val manager = context.getSystemService(LocationManager::class.java)
    val enabled =
        manager?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true ||
                manager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true

    check(enabled) {
        "Dịch vụ vị trí đang tắt. Vui lòng bật GPS."
    }

    val tokenSource = CancellationTokenSource()

    try {
        val location = withTimeout(15_000L) {
            LocationServices.getFusedLocationProviderClient(context)
                .getCurrentLocation(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    tokenSource.token
                )
                .await()
        } ?: error("Chưa lấy được mẫu GPS mới.")

        val ageNanos =
            SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos

        check(ageNanos in 0L..30_000_000_000L) {
            "Mẫu GPS đã cũ. Sẽ lấy mẫu mới."
        }

        return SosGpsSample(
            latitude = location.latitude,
            longitude = location.longitude,
            capturedAtMillis = location.time
        )
    } catch (_: TimeoutCancellationException) {
        throw IllegalStateException(
            "Lấy GPS quá thời gian. Sẽ thử lại bằng mẫu mới."
        )
    } finally {
        tokenSource.cancel()
    }
}

@Composable
fun ResidentSosUploadPanel(
    sosId: String,
    tracking: ResidentSosTracking
) {
    val context = LocalContext.current
    val state by tracking.uploader.state.collectAsState()
    val discoveryError by tracking.discoveryError.collectAsState()

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.any { it }) {
            tracking.retryLocation()
        }
    }

    if (state.sosId != sosId && !state.accessDenied) return

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color(0xFF102638),
        shape = MaterialTheme.shapes.large
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                "ĐỒNG BỘ VỊ TRÍ SOS",
                color = Color(0xFF20D7FF)
            )

            Text(
                state.message ?: "Đang kiểm tra cập nhật vị trí.",
                color = Color.White
            )

            discoveryError
                ?.takeIf { it != state.message }
                ?.let {
                    Text(it, color = Color(0xFFFFB4AB))
                }

            Text(
                "Mục tiêu khoảng 30 giây khi ứng dụng đang mở. " +
                        "Ra nền hoặc khóa màn hình sẽ tạm dừng; " +
                        "mở lại để kiểm tra trạng thái và tiếp tục.",
                color = Color(0xFF91A9B9)
            )

            if (!state.accessDenied) {
                OutlinedButton(
                    onClick = {
                        if (hasResidentLocationPermission(context)) {
                            tracking.retryLocation()
                        } else {
                            permissionLauncher.launch(
                                arrayOf(
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                )
                            )
                        }
                    }
                ) {
                    Text(
                        "Cấp quyền / thử lại GPS",
                        color = Color(0xFF20D7FF)
                    )
                }
            }
        }
    }
}