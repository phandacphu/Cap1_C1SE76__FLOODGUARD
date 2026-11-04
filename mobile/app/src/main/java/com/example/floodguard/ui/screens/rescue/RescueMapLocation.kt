package com.example.floodguard.ui.screens.rescue

import android.Manifest
import android.app.Activity
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
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
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.Granularity
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout

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
    val centerRequestId: Long = 0L,
    val failure: RescueGpsFailure? = null
) {
    val actionLabel: String
        get() = if (isLoading) "Đang lấy…" else failure?.actionLabel ?: "Vị trí của tôi"
}

internal data class RescueMapLocationController(
    val state: RescueMapLocationState,
    val locate: () -> Unit,
    val openAppSettings: () -> Unit
)

private fun gpsFailure(failure: RescueGpsFailure) =
    RescueMapLocationState(message = failure.message, failure = failure)

/** One foreground request per session entry or recovery action; no background polling. */
@SuppressLint("MissingPermission")
@Composable
internal fun rememberRescueMapLocation(autoLocate: Boolean = false): RescueMapLocationController {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val activity = remember(context) { context.rescueActivity() }
    val client = remember(context) {
        LocationServices.getFusedLocationProviderClient(context.applicationContext)
    }
    // Use the same permission history as the existing Resident map.
    val permissionPrefs = remember(context) {
        context.getSharedPreferences("location_permission_prefs", Context.MODE_PRIVATE)
    }
    var state by remember { mutableStateOf(RescueMapLocationState()) }
    var requestId by remember { mutableIntStateOf(0) }
    var consumedRequestId by remember { mutableIntStateOf(0) }
    var environmentRevision by remember { mutableIntStateOf(0) }
    var automaticRequestStarted by remember { mutableStateOf(false) }
    var waitingForPermission by remember { mutableStateOf(false) }
    var waitingForSettings by remember { mutableStateOf(false) }
    var retryAfterSettings by remember { mutableStateOf(false) }
    var previousPermission by remember { mutableStateOf<RescueGpsPermission?>(null) }
    var activeCancellation by remember { mutableStateOf<CancellationTokenSource?>(null) }
    var isActive by remember(lifecycleOwner) {
        mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
    }

    fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    fun permissionStatus(): RescueGpsPermission = rescueGpsPermission(
        hasFine = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION),
        hasCoarse = hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION),
        hasRequestedBefore = permissionPrefs.getBoolean("has_requested_location_permission", false),
        shouldShowRationale = activity?.let {
            ActivityCompat.shouldShowRequestPermissionRationale(it, Manifest.permission.ACCESS_FINE_LOCATION) ||
                ActivityCompat.shouldShowRequestPermissionRationale(it, Manifest.permission.ACCESS_COARSE_LOCATION)
        } == true
    )

    fun permissionFailure(permission: RescueGpsPermission): RescueGpsFailure = when (permission) {
        RescueGpsPermission.BLOCKED -> RescueGpsFailure.PERMISSION_BLOCKED
        RescueGpsPermission.DENIED -> RescueGpsFailure.PERMISSION_DENIED
        else -> RescueGpsFailure.PERMISSION_REQUIRED
    }

    fun locationEnabled(): Boolean {
        val manager = context.getSystemService(LocationManager::class.java)
        return manager != null && LocationManagerCompat.isLocationEnabled(manager)
    }

    fun fail(failure: RescueGpsFailure) {
        state = gpsFailure(failure)
        consumedRequestId = requestId
        activeCancellation?.cancel()
    }

    fun enqueueLocation() {
        state = RescueMapLocationState(isLoading = true, message = "Đang lấy vị trí…")
        requestId++
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        waitingForPermission = false
        if (permissions.isNotEmpty()) {
            permissionPrefs.edit().putBoolean("has_requested_location_permission", true).apply()
        }
        state = if (permissions.isEmpty()) {
            gpsFailure(RescueGpsFailure.PERMISSION_DENIED)
        } else {
            val permission = permissionStatus()
            if (permission.isGranted) {
                retryAfterSettings = true
                RescueMapLocationState()
            } else gpsFailure(permissionFailure(permission))
        }
        environmentRevision++
    }

    val settingsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        waitingForSettings = false
        retryAfterSettings = true
        environmentRevision++
    }

    fun openSettings(action: String) {
        if (waitingForSettings || !lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) return
        val intent = Intent(action).apply {
            if (action == Settings.ACTION_APPLICATION_DETAILS_SETTINGS) {
                data = Uri.fromParts("package", context.packageName, null)
            }
        }
        try {
            waitingForSettings = true
            settingsLauncher.launch(intent)
        } catch (_: Exception) {
            waitingForSettings = false
            state = state.copy(message = "Không mở được Cài đặt. Hãy mở Cài đặt của thiết bị để kiểm tra quyền và vị trí.")
        }
    }

    DisposableEffect(context, lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> isActive = true
                Lifecycle.Event.ON_RESUME -> environmentRevision++
                Lifecycle.Event.ON_STOP -> {
                    isActive = false
                    activeCancellation?.cancel()
                    consumedRequestId = requestId
                    state = state.copy(
                        fix = null, isLoading = false, centerRequestId = 0L,
                        message = state.failure?.message ?: "Bấm “Vị trí của tôi” để cập nhật vị trí khi quay lại."
                    )
                }
                else -> Unit
            }
        }
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                environmentRevision++
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        ContextCompat.registerReceiver(
            context, receiver, IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        onDispose {
            activeCancellation?.cancel()
            context.unregisterReceiver(receiver)
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(environmentRevision, isActive) {
        if (!isActive || waitingForPermission || waitingForSettings) return@LaunchedEffect
        val permission = permissionStatus()
        val changedPermission = previousPermission != null && previousPermission != permission
        previousPermission = permission
        when {
            !permission.isGranted -> {
                retryAfterSettings = false
                fail(permissionFailure(permission))
            }
            !locationEnabled() -> {
                retryAfterSettings = false
                fail(RescueGpsFailure.LOCATION_OFF)
            }
            retryAfterSettings || changedPermission || state.failure == RescueGpsFailure.LOCATION_OFF -> {
                retryAfterSettings = false
                if (!state.isLoading) enqueueLocation()
            }
            state.failure == RescueGpsFailure.PERMISSION_REQUIRED ||
                state.failure == RescueGpsFailure.PERMISSION_DENIED ||
                state.failure == RescueGpsFailure.PERMISSION_BLOCKED -> state = RescueMapLocationState()
            else -> Unit
        }
    }

    LaunchedEffect(requestId, isActive) {
        if (!isActive || requestId <= consumedRequestId) return@LaunchedEffect
        consumedRequestId = requestId
        val currentRequestId = requestId
        val cancellation = CancellationTokenSource()
        activeCancellation = cancellation
        try {
            val permission = permissionStatus()
            if (!permission.isGranted) {
                fail(permissionFailure(permission))
                return@LaunchedEffect
            }
            if (!locationEnabled()) {
                fail(RescueGpsFailure.LOCATION_OFF)
                return@LaunchedEffect
            }
            val request = CurrentLocationRequest.Builder()
                .setPriority(if (permission == RescueGpsPermission.PRECISE) {
                    Priority.PRIORITY_HIGH_ACCURACY
                } else Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setGranularity(Granularity.GRANULARITY_PERMISSION_LEVEL)
                .setMaxUpdateAgeMillis(RESCUE_GPS_MAX_AGE_MILLIS)
                .build()
            val result = withTimeout(RESCUE_GPS_TIMEOUT_MILLIS) {
                client.getCurrentLocation(request, cancellation.token).await()
            }
            if (!isActive || !state.isLoading || currentRequestId != requestId) return@LaunchedEffect
            val currentPermission = permissionStatus()
            when {
                !currentPermission.isGranted -> fail(permissionFailure(currentPermission))
                !locationEnabled() -> fail(RescueGpsFailure.LOCATION_OFF)
                currentPermission != permission || result == null -> fail(RescueGpsFailure.UNAVAILABLE)
                else -> {
                    val failure = rescueGpsFixFailure(
                        result.latitude, result.longitude, result.elapsedRealtimeNanos,
                        SystemClock.elapsedRealtimeNanos()
                    )
                    state = if (failure != null) gpsFailure(failure) else RescueMapLocationState(
                        fix = RescueMapLocationFix(
                            latitude = result.latitude,
                            longitude = result.longitude,
                            accuracyMeters = result.accuracy.takeIf {
                                result.hasAccuracy() && it.isFinite() && it >= 0f
                            },
                            isApproximate = currentPermission == RescueGpsPermission.APPROXIMATE
                        ),
                        centerRequestId = SystemClock.elapsedRealtimeNanos()
                    )
                }
            }
        } catch (_: TimeoutCancellationException) {
            if (isActive && state.isLoading && currentRequestId == requestId) fail(RescueGpsFailure.TIMEOUT)
        } catch (error: CancellationException) {
            // Preserve lifecycle cancellation; a cancelled FLP Task must not leave a spinner forever.
            currentCoroutineContext().ensureActive()
            if (isActive && state.isLoading && currentRequestId == requestId) fail(RescueGpsFailure.UNAVAILABLE)
        } catch (_: SecurityException) {
            val permission = permissionStatus()
            fail(if (permission.isGranted) RescueGpsFailure.UNAVAILABLE else permissionFailure(permission))
        } catch (_: Exception) {
            fail(RescueGpsFailure.UNAVAILABLE)
        } finally {
            cancellation.cancel()
            if (activeCancellation === cancellation) activeCancellation = null
        }
    }

    val locate: () -> Unit = {
        if (!state.isLoading && !waitingForSettings &&
            lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
        ) {
            val permission = permissionStatus()
            when {
                permission == RescueGpsPermission.BLOCKED -> openSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                !permission.isGranted -> {
                    waitingForPermission = true
                    state = RescueMapLocationState(isLoading = true, message = "Đang chờ quyền vị trí…")
                    permissionLauncher.launch(arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ))
                }
                !locationEnabled() -> {
                    fail(RescueGpsFailure.LOCATION_OFF)
                    openSettings(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                }
                else -> enqueueLocation()
            }
        }
    }

    LaunchedEffect(autoLocate, isActive) {
        if (autoLocate && isActive && !automaticRequestStarted) {
            automaticRequestStarted = true
            val permission = permissionStatus()
            when {
                !permission.isGranted && permission != RescueGpsPermission.NOT_REQUESTED ->
                    fail(permissionFailure(permission))
                permission.isGranted && !locationEnabled() -> fail(RescueGpsFailure.LOCATION_OFF)
                else -> locate()
            }
        }
    }

    return RescueMapLocationController(
        state = state, locate = locate,
        openAppSettings = { openSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS) }
    )
}

private fun Context.rescueActivity(): Activity? {
    var current = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        val next = current.baseContext
        if (next === current) return null
        current = next
    }
    return current as? Activity
}
