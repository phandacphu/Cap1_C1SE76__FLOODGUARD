package com.example.floodguard.ui.screens.rescue

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

internal data class RescueMapLocationFix(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float?,
    val isApproximate: Boolean
)

internal data class RescueMapLocationState(
    val fix: RescueMapLocationFix? = null,
    val isLoading: Boolean = false,
    val message: String = "Bấm “Vị trí của tôi” để lấy vị trí.",
    val centerRequestId: Long = 0L
)

internal data class RescueMapLocationController(
    val state: RescueMapLocationState,
    val locate: () -> Unit
)

/** Uses the same FLP service and foreground permissions as the existing Map/SOS.
 * Session entry and each tap request one fix; there is no background tracking.
 */
@SuppressLint("MissingPermission")
@Composable
internal fun rememberRescueMapLocation(autoLocate: Boolean = false): RescueMapLocationController {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val client = remember(context) {
        LocationServices.getFusedLocationProviderClient(context.applicationContext)
    }
    var state by remember { mutableStateOf(RescueMapLocationState()) }
    var requestId by remember { mutableIntStateOf(0) }
    var consumedRequestId by remember { mutableIntStateOf(0) }
    var automaticRequestStarted by remember { mutableStateOf(false) }
    var activeCancellation by remember { mutableStateOf<CancellationTokenSource?>(null) }
    var isActive by remember(lifecycleOwner) {
        mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
    }

    fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (!lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
            state = RescueMapLocationState()
        } else if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        ) {
            requestId++
        } else {
            state = RescueMapLocationState(
                message = "Chưa được cấp quyền vị trí. Bạn vẫn có thể xem bản đồ."
            )
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> isActive = true
                Lifecycle.Event.ON_STOP -> {
                    isActive = false
                    activeCancellation?.cancel()
                    consumedRequestId = requestId
                    state = RescueMapLocationState()
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            activeCancellation?.cancel()
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(requestId, isActive) {
        if (!isActive || requestId <= consumedRequestId) return@LaunchedEffect
        consumedRequestId = requestId

        val hasFinePermission = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        if (!hasFinePermission && !hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
            state = RescueMapLocationState(message = "Cần cấp quyền để lấy vị trí cứu hộ.")
            return@LaunchedEffect
        }

        val manager = context.getSystemService(LocationManager::class.java)
        val locationEnabled = manager?.let {
            it.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                it.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        } == true
        if (!locationEnabled) {
            state = RescueMapLocationState(message = "Dịch vụ vị trí đang tắt. Hãy bật vị trí rồi thử lại.")
            return@LaunchedEffect
        }

        state = RescueMapLocationState(isLoading = true, message = "Đang lấy vị trí…")
        val cancellation = CancellationTokenSource()
        activeCancellation = cancellation
        try {
            val location = withTimeoutOrNull(15_000L) {
                client.getCurrentLocation(
                    if (hasFinePermission) Priority.PRIORITY_HIGH_ACCURACY
                    else Priority.PRIORITY_BALANCED_POWER_ACCURACY,
                    cancellation.token
                ).await()
            }
            if (!lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                return@LaunchedEffect
            }
            val fix = location?.toRescueMapFix(isApproximate = !hasFinePermission)
            state = if (fix != null) {
                RescueMapLocationState(fix = fix, centerRequestId = SystemClock.elapsedRealtimeNanos())
            } else {
                RescueMapLocationState(message = "Chưa lấy được vị trí mới. Hãy bấm “Vị trí của tôi” để thử lại.")
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: SecurityException) {
            state = RescueMapLocationState(message = "Quyền vị trí đã thay đổi. Vui lòng cấp lại quyền.")
        } catch (_: Exception) {
            state = RescueMapLocationState(message = "Không thể lấy vị trí. Bạn vẫn có thể xem bản đồ và thử lại.")
        } finally {
            cancellation.cancel()
            if (activeCancellation === cancellation) activeCancellation = null
        }
    }

    val locate: () -> Unit = {
        if (!state.isLoading && lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
            state = RescueMapLocationState(isLoading = true, message = "Đang lấy vị trí…")
            if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
                hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
            ) {
                requestId++
            } else {
                permissionLauncher.launch(arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ))
            }
        }
    }

    // This controller is owned by the authenticated Rescue navigation scope.
    // Switching tabs keeps the same controller; logout disposes it.
    LaunchedEffect(autoLocate, isActive) {
        if (autoLocate && isActive && !automaticRequestStarted) {
            automaticRequestStarted = true
            locate()
        }
    }

    return RescueMapLocationController(state = state, locate = locate)
}

private fun Location.toRescueMapFix(isApproximate: Boolean): RescueMapLocationFix? {
    val ageNanos = SystemClock.elapsedRealtimeNanos() - elapsedRealtimeNanos
    if (!latitude.isFinite() || !longitude.isFinite() ||
        latitude !in -90.0..90.0 || longitude !in -180.0..180.0 ||
        elapsedRealtimeNanos <= 0L || ageNanos !in 0L..30_000_000_000L
    ) return null

    return RescueMapLocationFix(
        latitude = latitude,
        longitude = longitude,
        accuracyMeters = accuracy.takeIf { hasAccuracy() && it.isFinite() && it >= 0f },
        isApproximate = isApproximate
    )
}
