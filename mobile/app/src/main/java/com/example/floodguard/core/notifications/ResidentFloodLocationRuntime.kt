package com.example.floodguard.core.notifications

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.example.floodguard.BuildConfig
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.model.FloodLocationUnavailableReason
import com.example.floodguard.data.model.FloodLocationV2Evaluation
import com.example.floodguard.data.model.FloodLocationV2Fix
import com.example.floodguard.data.repository.FloodLocationV2ApiException
import com.example.floodguard.data.repository.FloodLocationV2Coordinator
import com.example.floodguard.data.repository.FloodLocationV2Repository
import com.example.floodguard.data.repository.ObsoleteFloodLocationContextException
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import java.time.Instant
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

data class ResidentFloodLocationState(
    val generation: Long? = null,
    val evaluation: FloodLocationV2Evaluation? = null,
    val reason: String = "stopped"
)

/**
 * Được sở hữu bởi NotificationDeviceRuntime.
 * Các hàm start/stop và scope phải chạy trên Main.
 */
class ResidentFloodLocationRuntime(
    context: Context,
    private val sessionManager: SessionManager,
    bindingStore: NotificationBindingStore,
    private val scope: CoroutineScope
) {
    private val appContext = context.applicationContext
    private val locationClient =
        LocationServices.getFusedLocationProviderClient(appContext)

    private val coordinator = FloodLocationV2Coordinator(
        bindingStore,
        FloodLocationV2Repository.create()
    )

    private val mutableState =
        MutableStateFlow(ResidentFloodLocationState())

    val state = mutableState.asStateFlow()

    private data class RunKey(
        val generation: Long,
        val registrationId: String,
        val installationId: String,
        val bindingId: String
    )

    private data class Gate(
        val online: Boolean,
        val unavailableReason: FloodLocationUnavailableReason?
    )

    private var job: Job? = null
    private var key: RunKey? = null
    private var activeRun: Any? = null
    private var expiresAtElapsed: Long? = null

    fun start(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding
    ) {
        val nextKey = RunKey(
            session.generation,
            session.registrationId,
            identity.installationId,
            binding.bindingId
        )

        if (key == nextKey && job?.isActive == true) return

        stop()
        key = nextKey

        val run = Any()
        activeRun = run

        job = scope.launch {
            try {
                coroutineScope {
                    val expiryJob = launch {
                        while (isActive) {
                            val expiry = expiresAtElapsed
                            if (
                                activeRun === run &&
                                expiry != null &&
                                SystemClock.elapsedRealtime() >= expiry
                            ) {
                                clear(run, session, "stale_location")
                            }
                            delay(250L)
                        }
                    }

                    try {
                        flow {
                            while (
                                currentCoroutineContext().isActive &&
                                activeRun === run &&
                                sessionManager.isCurrentSession(session)
                            ) {
                                emit(readGate())
                                delay(500L)
                            }
                        }
                            .distinctUntilChanged()
                            .collectLatest { gate ->
                                // Hủy request/fix cũ khi điều kiện thay đổi.
                                clear(
                                    run,
                                    session,
                                    gate.unavailableReason?.wireValue
                                        ?: if (!gate.online) {
                                            "offline"
                                        } else {
                                            "acquiring_location"
                                        }
                                )

                                if (gate.online) {
                                    runGate(
                                        run,
                                        session,
                                        identity,
                                        binding,
                                        gate
                                    )
                                }
                            }
                    } finally {
                        expiryJob.cancel()
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                clear(run, session, "location_runtime_error")
            } finally {
                if (activeRun === run) {
                    expiresAtElapsed = null
                    activeRun = null
                    key = null
                    mutableState.value = ResidentFloodLocationState()
                }
            }
        }
    }

    fun stop() {
        activeRun = null
        key = null
        expiresAtElapsed = null
        job?.cancel()
        job = null
        mutableState.value = ResidentFloodLocationState()
    }

    private suspend fun runGate(
        run: Any,
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding,
        gate: Gate
    ) {
        var lastFixElapsedNanos: Long? = null

        while (
            currentCoroutineContext().isActive &&
            activeRun === run &&
            sessionManager.isCurrentSession(session) &&
            readGate() == gate
        ) {
            val location = if (gate.unavailableReason == null) {
                readFreshLocation()
            } else {
                null
            }

            if (location != null) {
                val waitMillis = FloodLocationUploadTiming.delayMillis(
                    capturedElapsedNanos = location.elapsedRealtimeNanos,
                    nowElapsedNanos = SystemClock.elapsedRealtimeNanos()
                )

                if (waitMillis > 0L) {
                    delay(waitMillis)
                }
            }

            // Kiểm tra lại sau thời gian chờ GPS.
            if (
                activeRun !== run ||
                readGate() != gate ||
                !sessionManager.isCurrentSession(session)
            ) {
                return
            }

            val fix = location?.let { toFix(it) }
                ?.takeIf {
                    lastFixElapsedNanos == null ||
                            requireNotNull(location).elapsedRealtimeNanos >
                            requireNotNull(lastFixElapsedNanos)
                }

            val result =
                if (gate.unavailableReason != null) {
                    coordinator.uploadUnavailable(
                        session,
                        identity,
                        binding,
                        gate.unavailableReason
                    )
                } else if (fix != null) {
                    lastFixElapsedNanos = location.elapsedRealtimeNanos

                    if (fix.accuracyM == null || fix.accuracyM > 100.0) {
                        clear(run, session, "poor_accuracy")
                    }

                    coordinator.uploadAvailable(
                        session,
                        identity,
                        binding,
                        fix
                    )
                } else {
                    // Không giữ kết luận từ mẫu GPS trước.
                    clear(run, session, "no_fix")

                    coordinator.uploadUnavailable(
                        session,
                        identity,
                        binding,
                        FloodLocationUnavailableReason.NO_FIX
                    )
                }

            if (
                activeRun !== run ||
                !sessionManager.isCurrentSession(session) ||
                activeRun !== run ||
                readGate() != gate
            ) {
                return
            }

            val evaluation = result.getOrNull()

            if (evaluation != null) {
                publishEvaluation(run, session, evaluation)

                // Trạng thái mất quyền/GPS đã đồng bộ.
                // Chờ gate thay đổi, không gửi lặp liên tục.
                if (gate.unavailableReason != null) return

                delay(30_000L)
            } else {
                val error = result.exceptionOrNull()

                if (error is ObsoleteFloodLocationContextException) {
                    clear(run, session, "context_changed")
                    return
                }

                val apiError = error as? FloodLocationV2ApiException

                clear(
                    run,
                    session,
                    apiError?.let { "http_${it.httpStatus}" }
                        ?: "location_sync_failed"
                )

                // Không tự sửa binding hoặc chữa xung đột bằng retry.
                if (
                    apiError != null &&
                    apiError.httpStatus in 400..499 &&
                    apiError.httpStatus !in setOf(408, 429)
                ) {
                    return
                }

                // Sau lỗi sẽ lấy mẫu mới, không phát lại GPS cũ.
                delay(
                    apiError?.retryAfterMillis
                        ?.coerceAtLeast(1_000L)
                        ?: 60_000L
                )
            }
        }
    }

    private fun publishEvaluation(
        run: Any,
        session: AuthenticatedSessionSnapshot,
        evaluation: FloodLocationV2Evaluation
    ) {
        if (activeRun !== run) return

        val now = Instant.now()
        val displayed = evaluation.forDisplayAt(now)

        expiresAtElapsed = displayed.validUntil?.let { validUntil ->
            val remaining = (validUntil.toEpochMilli() - now.toEpochMilli())
                .coerceIn(0L, 60_000L)

            SystemClock.elapsedRealtime() + remaining
        }

        mutableState.value = ResidentFloodLocationState(
            generation = session.generation,
            evaluation = displayed,
            reason = readGate().unavailableReason?.wireValue
                ?: displayed.reason
                ?: displayed.status.name.lowercase()
        )

        if (BuildConfig.DEBUG) {
            Log.i(
                "FloodWarningLocation",
                "generation=${session.generation}; " +
                        "sequence=${displayed.sequence}; " +
                        "status=${displayed.status}; " +
                        "reason=${displayed.reason}; " +
                        "hasLocation=${displayed.location != null}; " +
                        "matches=${displayed.matches.size}"
            )
        }
    }

    private fun clear(
        run: Any,
        session: AuthenticatedSessionSnapshot,
        reason: String
    ) {
        if (activeRun !== run) return

        expiresAtElapsed = null

        val next = ResidentFloodLocationState(
            generation = session.generation,
            reason = reason
        )

        if (mutableState.value == next) return
        mutableState.value = next

        if (BuildConfig.DEBUG) {
            Log.i(
                "FloodWarningLocation",
                "generation=${session.generation}; reason=$reason"
            )
        }
    }

    private fun readGate(): Gate {
        val permissionGranted =
            hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
                    hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)

        val manager =
            appContext.getSystemService(LocationManager::class.java)

        val locationEnabled = manager != null &&
                LocationManagerCompat.isLocationEnabled(manager)

        val unavailableReason = when {
            !permissionGranted ->
                FloodLocationUnavailableReason.PERMISSION_DENIED

            !locationEnabled ->
                FloodLocationUnavailableReason.LOCATION_DISABLED

            else -> null
        }

        val connectivity =
            appContext.getSystemService(ConnectivityManager::class.java)

        val capabilities = connectivity?.activeNetwork?.let {
            connectivity.getNetworkCapabilities(it)
        }

        val online = capabilities != null &&
                capabilities.hasCapability(
                    NetworkCapabilities.NET_CAPABILITY_INTERNET
                ) &&
                capabilities.hasCapability(
                    NetworkCapabilities.NET_CAPABILITY_VALIDATED
                )

        return Gate(online, unavailableReason)
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(
            appContext,
            permission
        ) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    private suspend fun readFreshLocation(): Location? {
        return try {
            withTimeoutOrNull(15_000L) {
                suspendCancellableCoroutine<Location?> { continuation ->
                    val cancellation = CancellationTokenSource()

                    continuation.invokeOnCancellation {
                        cancellation.cancel()
                    }

                    val request = CurrentLocationRequest.Builder()
                        .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                        .setMaxUpdateAgeMillis(0L)
                        .setDurationMillis(15_000L)
                        .build()

                    locationClient.getCurrentLocation(
                        request,
                        cancellation.token
                    )
                        .addOnSuccessListener { location ->
                            if (continuation.isActive) {
                                continuation.resume(location)
                            }
                        }
                        .addOnFailureListener { error ->
                            if (continuation.isActive) {
                                continuation.resumeWithException(error)
                            }
                        }
                        .addOnCanceledListener {
                            continuation.cancel()
                        }
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            null
        }
    }

    private fun toFix(location: Location): FloodLocationV2Fix? {
        val elapsedAge =
            SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos
        val now = System.currentTimeMillis()

        if (
            location.elapsedRealtimeNanos <= 0L ||
            elapsedAge !in 0L..60_000_000_000L ||
            location.time <= 0L ||
            location.time > now ||
            now - location.time > 60_000L
        ) {
            return null
        }

        return runCatching {
            FloodLocationV2Fix(
                location.latitude,
                location.longitude,
                location.time,
                if (location.hasAccuracy()) {
                    location.accuracy.toDouble()
                } else {
                    null
                }
            )
        }.getOrNull()
    }
}